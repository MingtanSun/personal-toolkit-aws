import json
import os
import re
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ.get("TASKS_TABLE_NAME", "TodoTable"))

# Shared headers for JSON API responses (browser CORS when API Gateway is incomplete).
JSON_CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
}


def json_response(status, payload, extra_headers=None):
    headers = dict(JSON_CORS_HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    return {"statusCode": status, "headers": headers, "body": json.dumps(payload)}


def error_response(status, message, code=None):
    """Small JSON error body; `code` becomes `error` when set."""
    if code:
        body = {"error": code, "message": message}
    else:
        body = {"error": message}
    return json_response(status, body)


def options_response():
    headers = dict(JSON_CORS_HEADERS)
    headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,DELETE,OPTIONS"
    headers["Access-Control-Allow-Headers"] = "content-type,authorization"
    return {"statusCode": 204, "headers": headers, "body": ""}


def _parse_json_body(event):
    raw = event.get("body") or "{}"
    if not raw:
        raw = "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _get_claims(event):
    """Read verified JWT claims injected by API Gateway Cognito/JWT authorizers."""
    authorizer = (event.get("requestContext") or {}).get("authorizer") or {}
    jwt_claims = (authorizer.get("jwt") or {}).get("claims")
    if isinstance(jwt_claims, dict):
        return jwt_claims
    claims = authorizer.get("claims")
    if isinstance(claims, dict):
        return claims
    return {}


def get_authenticated_user(event):
    claims = _get_claims(event)
    user_id = (claims.get("sub") or "").strip()
    if not user_id:
        return None
    return {
        "userId": user_id,
        "email": (claims.get("email") or "").strip(),
        "username": (claims.get("cognito:username") or claims.get("username") or "").strip(),
    }


def require_user(event):
    user = get_authenticated_user(event)
    if not user:
        return None, error_response(
            401,
            "Authentication is required. Sign in and retry the request.",
            "unauthorized",
        )
    return user, None


def _task_pk(user_id):
    return f"USER#{user_id}"


def _task_sk(task_id):
    return f"TASK#{task_id}"


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _public_task(item):
    return {
        "taskId": item.get("taskId", ""),
        "title": item.get("title", ""),
        "completed": bool(item.get("completed", False)),
        "starred": bool(item.get("starred", False)),
        "createdAt": item.get("createdAt", ""),
        "updatedAt": item.get("updatedAt", ""),
        "priority": item.get("priority", "normal"),
    }


ATOM_NS = "{http://www.w3.org/2005/Atom}"

# Major international outlets. GET /news = headlines + links only.
# Keep in sync with frontend/app.js CLIENT_NEWS_FEEDS.
# Many RSS hosts block non-browser user-agents; match Yahoo path style for fewer empty fetches.
_RSS_FEED_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
_FEED_FETCH_TIMEOUT = 12.0
_FEED_FETCH_RETRIES = 2

NEWS_FEEDS = (
    ("https://rss.nytimes.com/services/xml/rss/nyt/World.xml", "The New York Times"),
    ("https://www.theguardian.com/world/rss", "The Guardian"),
    ("https://feeds.bbci.co.uk/news/world/rss.xml", "BBC News"),
    ("https://feeds.washingtonpost.com/rss/world", "The Washington Post"),
    ("https://www.ft.com/world?format=rss", "Financial Times"),
    ("https://www.xinhuanet.com/english/rss/worldrss.xml", "Xinhua"),
    ("https://www.thetimes.co.uk/tto/news/world/rss", "The Times"),
    ("https://www.telegraph.co.uk/world-news/rss.xml", "The Telegraph"),
)


def _strip_tags(s):
    if not s:
        return ""
    return re.sub(r"<[^>]+>", "", s).strip()


def _parse_pub_date(s):
    if not s or not str(s).strip():
        return None
    try:
        dt = parsedate_to_datetime(str(s).strip())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        return None


def _fetch_feed_bytes(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": _RSS_FEED_UA,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
    )
    for attempt in range(_FEED_FETCH_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=_FEED_FETCH_TIMEOUT) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt + 1 < _FEED_FETCH_RETRIES:
                time.sleep(0.4)
    return None


def _parse_feed(url, source_label, max_items=7):
    items = []
    raw = _fetch_feed_bytes(url)
    if not raw:
        return items

    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return items

    for item in root.findall(".//item")[:max_items]:
        t_el = item.find("title")
        title = _strip_tags((t_el.text or "").strip() if t_el is not None else "")
        link = ""
        l_el = item.find("link")
        if l_el is not None and (l_el.text or "").strip():
            link = (l_el.text or "").strip()
        if not link:
            guid = item.find("guid")
            if guid is not None and (guid.text or "").strip():
                link = (guid.text or "").strip()
        pub_raw = item.findtext("pubDate", default="") or ""
        if title and link.startswith(("http://", "https://")):
            items.append(
                {
                    "title": title[:300],
                    "url": link,
                    "source": source_label,
                    "published": _parse_pub_date(pub_raw),
                }
            )

    if not items:
        for entry in root.findall(f".//{ATOM_NS}entry")[:max_items]:
            t_el = entry.find(f"{ATOM_NS}title")
            title = _strip_tags((t_el.text or "").strip() if t_el is not None else "")
            link = ""
            for rel in ("alternate", "self"):
                for link_el in entry.findall(f"{ATOM_NS}link"):
                    if link_el.get("rel") in (None, rel) and link_el.get("href"):
                        link = link_el.get("href", "").strip()
                        break
                if link:
                    break
            pub_el = entry.find(f"{ATOM_NS}updated")
            if pub_el is None:
                pub_el = entry.find(f"{ATOM_NS}published")
            pub_raw = (pub_el.text or "").strip() if pub_el is not None else ""
            pub_dt = None
            if pub_raw:
                try:
                    pub_dt = datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                except ValueError:
                    pub_dt = _parse_pub_date(pub_raw)
            if title and link.startswith(("http://", "https://")):
                items.append(
                    {
                        "title": title[:300],
                        "url": link,
                        "source": source_label,
                        "published": pub_dt,
                    }
                )

    return items


def build_world_news_payload(limit=22):
    merged = []
    with ThreadPoolExecutor(max_workers=min(10, len(NEWS_FEEDS))) as pool:
        futs = [pool.submit(_parse_feed, u, label) for u, label in NEWS_FEEDS]
        for f in as_completed(futs):
            merged.extend(f.result())

    seen = set()
    unique = []
    for it in merged:
        key = it["url"].split("#")[0]
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)

    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    unique.sort(key=lambda x: x["published"] or epoch, reverse=True)
    out = []
    for it in unique[:limit]:
        row = {"title": it["title"], "url": it["url"], "source": it["source"]}
        if it["published"]:
            row["published"] = it["published"].astimezone(timezone.utc).isoformat()
        out.append(row)
    return out


TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "").strip()
TMDB_BASE_URL = os.environ.get("TMDB_BASE_URL", "https://api.themoviedb.org/3").rstrip("/")
TMDB_IMAGE_BASE_URL = os.environ.get("TMDB_IMAGE_BASE_URL", "https://image.tmdb.org/t/p/w342").rstrip("/")
_MOVIES_CACHE_TTL_S = 6 * 3600
_movies_cache = {}


def _parse_query_int(val, default=None):
    if val is None or str(val).strip() == "":
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _normalize_tmdb_region(value):
    region = (value or "CA").strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", region):
        return "CA"
    return region


def _tmdb_fetch_movies(path, region, page=1):
    params = urllib.parse.urlencode(
        {
            "api_key": TMDB_API_KEY,
            "region": region,
            "page": str(page),
            "language": "en-CA",
        }
    )
    req = urllib.request.Request(
        f"{TMDB_BASE_URL}{path}?{params}",
        headers={
            "Accept": "application/json",
            "User-Agent": "todo-aws-dashboard/1.0 (personal serverless dashboard)",
        },
    )
    with urllib.request.urlopen(req, timeout=12.0) as resp:
        return json.loads(resp.read().decode())


def _normalize_tmdb_movie(row):
    movie_id = row.get("id")
    poster_path = row.get("poster_path") or ""
    backdrop_path = row.get("backdrop_path") or ""
    release_date = row.get("release_date") or ""
    rating = row.get("vote_average")
    return {
        "id": str(movie_id) if movie_id is not None else "",
        "title": (row.get("title") or row.get("name") or "Untitled").strip()[:160],
        "overview": (row.get("overview") or "").strip()[:420],
        "releaseDate": release_date,
        "rating": round(float(rating), 1) if isinstance(rating, (int, float)) else None,
        "posterUrl": f"{TMDB_IMAGE_BASE_URL}{poster_path}" if poster_path else "",
        "backdropUrl": f"{TMDB_IMAGE_BASE_URL}{backdrop_path}" if backdrop_path else "",
        "tmdbUrl": f"https://www.themoviedb.org/movie/{movie_id}" if movie_id is not None else "",
    }


def _normalize_tmdb_category(value):
    category = (value or "now").strip().lower()
    if category in ("now", "now_playing", "playing"):
        return "now"
    if category in ("upcoming", "coming", "coming_soon"):
        return "upcoming"
    return "now"


def _tmdb_category_path(category):
    return "/movie/upcoming" if category == "upcoming" else "/movie/now_playing"


def _normalize_tmdb_page(value):
    page = _parse_query_int(value, 1)
    if page is None or page < 1:
        return 1
    return min(page, 500)


def _build_tmdb_movies_payload(region, category, page):
    data = _tmdb_fetch_movies(_tmdb_category_path(category), region, page)
    results = data.get("results") or []
    total_pages = _parse_query_int(data.get("total_pages"), 1) or 1
    total_results = _parse_query_int(data.get("total_results"), 0) or 0
    return {
        "region": region,
        "source": "tmdb",
        "category": category,
        "page": _parse_query_int(data.get("page"), page) or page,
        "totalPages": min(total_pages, 500),
        "totalResults": total_results,
        "items": [
            _normalize_tmdb_movie(row)
            for row in results
            if isinstance(row, dict)
        ],
    }


def handle_get_movies(query_params):
    if not TMDB_API_KEY:
        return error_response(
            503,
            "TMDB_API_KEY is not configured on the Lambda environment.",
            "tmdb_key_missing",
        )

    qp = query_params or {}
    region = _normalize_tmdb_region(qp.get("region"))
    category = _normalize_tmdb_category(qp.get("category"))
    page = _normalize_tmdb_page(qp.get("page"))
    now = time.time()
    cache_key = (region, category, page)
    cached = _movies_cache.get(cache_key)
    if cached and cached[0] > now:
        return json_response(200, cached[1])

    try:
        payload = _build_tmdb_movies_payload(region, category, page)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return error_response(502, "TMDB rejected the API key.", "tmdb_auth_failed")
        return error_response(502, "Could not load movies from TMDB.", "tmdb_fetch_failed")
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, ValueError):
        return error_response(502, "Could not load movies from TMDB.", "tmdb_fetch_failed")

    _movies_cache[cache_key] = (now + _MOVIES_CACHE_TTL_S, payload)
    return json_response(200, payload)


def handle_get_tasks(user):
    response = table.query(
        KeyConditionExpression=Key("PK").eq(_task_pk(user["userId"]))
        & Key("SK").begins_with("TASK#")
    )
    items = [_public_task(item) for item in response.get("Items", [])]
    items.sort(key=lambda x: x.get("createdAt") or "")
    return json_response(200, items)


def handle_get_news():
    """Always 200 + items[] so browsers always get JSON/CORS; empty list triggers client-side fallback."""
    try:
        items = build_world_news_payload()
        out = {"items": items}
        if not items:
            out["degraded"] = True
            out["error"] = "no_items"
        return json_response(200, out)
    except Exception:
        return json_response(
            200,
            {"items": [], "degraded": True, "error": "news_fetch_failed"},
        )


def handle_post_tasks(user, body):
    user_id = user["userId"]
    pk = _task_pk(user_id)
    now = _now_iso()

    if body.get("op") == "setStarred":
        task_id = body.get("taskId")
        if not task_id or "starred" not in body:
            return error_response(400, "taskId and starred are required", "invalid_request")
        try:
            table.update_item(
                Key={"PK": pk, "SK": _task_sk(task_id)},
                UpdateExpression="SET starred = :s, updatedAt = :u",
                ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
                ExpressionAttributeValues={":s": bool(body["starred"]), ":u": now},
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return error_response(404, "Task not found", "task_not_found")
            raise
        return json_response(200, {"message": "Task updated"})

    if body.get("op") == "setPriority":
        task_id = body.get("taskId")
        priority = body.get("priority")
        
        if not task_id or "priority" not in body:
            return error_response(400, "taskId and priority are required", "invalid_request")
            
        if priority != "normal" and priority != "high" and priority != "low" :
            return error_response(400, "priority must be normal, high, or low", "invalid_request")
        try:
            table.update_item(
                Key={"PK": pk, "SK": _task_sk(task_id)},
                UpdateExpression="SET priority = :p, updatedAt = :u",
                ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
                ExpressionAttributeValues={":p": priority, ":u": now},
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return error_response(404, "Task not found", "task_not_found")
            raise
        return json_response(200, {"message": "Task updated"})

    if body.get("op") == "setCompleted":
        task_id = body.get("taskId")
        if not task_id or "completed" not in body:
            return error_response(400, "taskId and completed are required", "invalid_request")
        try:
            table.update_item(
                Key={"PK": pk, "SK": _task_sk(task_id)},
                UpdateExpression="SET completed = :c, updatedAt = :u",
                ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
                ExpressionAttributeValues={":c": bool(body["completed"]), ":u": now},
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return error_response(404, "Task not found", "task_not_found")
            raise
        return json_response(200, {"message": "Task updated"})

    if body.get("op") == "rename":
        task_id = body.get("taskId")
        title = body.get("title")
        if not task_id or title is None or not str(title).strip():
            return error_response(400, "taskId and title are required", "invalid_request")
        title = str(title).strip()[:300]
        try:
            table.update_item(
                Key={"PK": pk, "SK": _task_sk(task_id)},
                UpdateExpression="SET title = :t, updatedAt = :u",
                ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
                ExpressionAttributeValues={":t": title, ":u": now},
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return error_response(404, "Task not found", "task_not_found")
            raise
        return json_response(200, {"message": "Task updated"})

    title = body.get("title")
    completed = bool(body.get("completed", False))
    starred = bool(body.get("starred", False))
    priority = body.get("priority", "normal")
    if priority != "normal" and priority != "high" and priority != "low" :
        return error_response(400, "priority must be normal, high, or low", "invalid_request")
    
    if title is None or not str(title).strip():
        return error_response(400, "title is required", "invalid_request")

    title = str(title).strip()[:300]

    task_id = str(uuid.uuid4())
    item = {
        "PK": pk,
        "SK": _task_sk(task_id),
        "taskId": task_id,
        "userId": user_id,
        "title": title,
        "completed": completed,
        "starred": starred,
        "createdAt": now,
        "updatedAt": now,
        "priority": priority,
    }
    table.put_item(
        Item=item,
        ConditionExpression="attribute_not_exists(PK) AND attribute_not_exists(SK)",
    )
    return json_response(200, {"message": "Task created", "task": _public_task(item)})


def handle_patch_task(user, task_id, body):
    if "completed" not in body:
        return error_response(400, "completed is required", "invalid_request")
    try:
        table.update_item(
            Key={"PK": _task_pk(user["userId"]), "SK": _task_sk(task_id)},
            UpdateExpression="SET completed = :c, updatedAt = :u",
            ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
            ExpressionAttributeValues={":c": bool(body["completed"]), ":u": _now_iso()},
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return error_response(404, "Task not found", "task_not_found")
        raise
    return json_response(200, {"message": "Task updated"})


def handle_delete_task(user, task_id):
    try:
        table.delete_item(
            Key={"PK": _task_pk(user["userId"]), "SK": _task_sk(task_id)},
            ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return error_response(404, "Task not found", "task_not_found")
        raise
    return json_response(200, {"message": "Task deleted"})


def lambda_handler(event, context):
    method = event["requestContext"]["http"]["method"]
    path = event["requestContext"]["http"]["path"]

    stage = event.get("requestContext", {}).get("stage")
    if stage and path.startswith(f"/{stage}/"):
        path = path[len(stage) + 1:]

    if method == "OPTIONS":
        return options_response()

    user, auth_error = require_user(event)
    if auth_error:
        return auth_error

    if method == "GET" and path == "/tasks":
        return handle_get_tasks(user)

    if method == "GET" and path == "/news":
        return handle_get_news()

    if method == "GET" and path == "/movies":
        return handle_get_movies(event.get("queryStringParameters") or {})

    if method == "POST" and path == "/tasks":
        body = _parse_json_body(event)
        if body is None:
            return error_response(400, "Invalid JSON body", "invalid_json")
        return handle_post_tasks(user, body)

    if method == "PATCH" and path.startswith("/tasks/"):
        task_id = path.split("/")[-1]
        body = _parse_json_body(event)
        if body is None:
            return error_response(400, "Invalid JSON body", "invalid_json")
        return handle_patch_task(user, task_id, body)

    if method == "DELETE" and path.startswith("/tasks/"):
        task_id = path.split("/")[-1]
        return handle_delete_task(user, task_id)

    return error_response(404, "Not found", "not_found")
