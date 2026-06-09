# Archived Restaurant Feature Plan: OpenStreetMap and Overpass API

This document records a proposed restaurant feature that is not active in the current application.

## Recommended Approach

Use OpenStreetMap data through the Overpass API from Lambda to find nearby restaurants. This was proposed as a free alternative to Yelp or Google Places for a personal dashboard.

| Dimension | OSM + Overpass | Yelp / Google |
| --- | --- | --- |
| Cost | Free public instances with fair-use limits | Usually paid after trial or quota |
| API key | Not required | Required |
| Restaurant POI coverage | Strong global POI data | Strong in many regions, weaker in some countries |
| Reviews and popularity ranking | Weak or unavailable | Strong |
| Compliance | ODbL attribution required | Platform-specific terms |
| Fit with this architecture | Good fit through Lambda proxy and caching | Also possible |

Conclusion: this approach is useful for free and legal nearby restaurant listings, but not for reproducing a Yelp-style ranked review experience.

## Proposed Architecture

```text
Browser Restaurants Panel
  -> API Gateway GET /restaurants
  -> Lambda
       -> Overpass API
       -> OpenStreetMap data
```

The frontend would reuse the selected weather city latitude and longitude. Lambda would proxy Overpass requests to avoid CORS issues and centralize caching and error handling.

## Proposed API

```text
GET /restaurants?lat=43.65&lon=-79.38&radius=4000&limit=12
```

Parameters:

| Parameter | Description |
| --- | --- |
| `lat`, `lon` | Required coordinates |
| `limit` | Default 12, maximum 20 |
| `radius` | Meters, default 4000, range 500 to 8000 |
| `label` | Optional display label returned to the frontend |

## Proposed Lambda Flow

1. Validate latitude and longitude.
2. Check in-memory cache.
3. Query Overpass with a recognizable user agent.
4. Parse restaurant elements.
5. Extract name, cuisine, address, Michelin-related tags if available, and coordinates.
6. Calculate distance with the haversine formula.
7. Sort by Michelin tags, stars, and distance.
8. Return a compact JSON response.

## Proposed Response

```json
{
  "items": [
    {
      "name": "Example Restaurant",
      "cuisine": "Italian",
      "distanceMeters": 450,
      "osmUrl": "https://www.openstreetmap.org/node/123"
    }
  ]
}
```

The response would intentionally avoid fields that OpenStreetMap does not reliably provide, such as ratings, review counts, and images.

## Compliance

Any implementation would need visible attribution:

```text
© OpenStreetMap contributors
```

The feature should not present OSM data as a user-review ranking product.

## Limitations

- No reliable user ratings or review counts.
- Michelin tags are sparse.
- Data quality varies by region.
- Public Overpass instances can be slow or rate limited.
- Heavy use would require stronger caching or a dedicated Overpass instance.

## Archive Status

This feature was not implemented in the active dashboard. The current product uses tasks, weather, news, and movies.
