import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock


class FakeTable:
    def __init__(self):
        self.items = {}
        self.last_query_pk = None

    def query(self, KeyConditionExpression=None):
        text = str(KeyConditionExpression)
        pk = "USER#alice" if "alice" in text else "USER#bob"
        self.last_query_pk = pk
        return {
            "Items": [
                item
                for (item_pk, _), item in self.items.items()
                if item_pk == pk
            ]
        }

    def put_item(self, Item, ConditionExpression=None):
        self.items[(Item["PK"], Item["SK"])] = Item
        return {}

    def update_item(self, Key, UpdateExpression=None, ExpressionAttributeValues=None, ConditionExpression=None):
        item = self.items.get((Key["PK"], Key["SK"]))
        if item is None:
            raise self._conditional_error()
        vals = ExpressionAttributeValues or {}
        if ":c" in vals:
            item["completed"] = vals[":c"]
        if ":s" in vals:
            item["starred"] = vals[":s"]
        if ":t" in vals:
            item["title"] = vals[":t"]
        if ":u" in vals:
            item["updatedAt"] = vals[":u"]
        return {}

    def delete_item(self, Key, ConditionExpression=None):
        if (Key["PK"], Key["SK"]) not in self.items:
            raise self._conditional_error()
        del self.items[(Key["PK"], Key["SK"])]
        return {}

    @staticmethod
    def _conditional_error():
        from botocore.exceptions import ClientError

        return ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": "missing"}},
            "UpdateItem",
        )


class FakeKey:
    def __init__(self, name):
        self.name = name
        self.value = None

    def eq(self, value):
        self.value = value
        return self

    def begins_with(self, value):
        self.value = value
        return self

    def __and__(self, other):
        return FakeCondition([self, other])

    def __str__(self):
        return str(self.value or "")


class FakeCondition:
    def __init__(self, parts):
        self.parts = parts

    def __str__(self):
        return " ".join(str(part) for part in self.parts)


def load_lambda_module():
    boto3_mock = MagicMock()
    boto3_mock.resource.return_value.Table.return_value = FakeTable()
    sys.modules.setdefault("boto3", boto3_mock)
    sys.modules["boto3.dynamodb"] = MagicMock()
    sys.modules["boto3.dynamodb.conditions"] = MagicMock(Key=FakeKey)

    if "botocore.exceptions" not in sys.modules:
        class ClientError(Exception):
            def __init__(self, response, operation_name):
                super().__init__(response["Error"]["Message"])
                self.response = response
                self.operation_name = operation_name

        botocore_mock = MagicMock()
        exceptions_mock = MagicMock(ClientError=ClientError)
        sys.modules["botocore"] = botocore_mock
        sys.modules["botocore.exceptions"] = exceptions_mock

    os.environ["TASKS_TABLE_NAME"] = "UnitTestTasks"
    path = Path(__file__).resolve().parents[1] / "backend" / "lambda_function.py"
    spec = importlib.util.spec_from_file_location("lambda_function_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.table = FakeTable()
    return module


def event(method, path, user_id=None, body=None):
    ev = {
        "requestContext": {
            "http": {"method": method, "path": path},
            "authorizer": {},
        },
        "body": json.dumps(body) if body is not None else None,
        "queryStringParameters": None,
    }
    if user_id:
        ev["requestContext"]["authorizer"] = {
            "jwt": {
                "claims": {
                    "sub": user_id,
                    "email": f"{user_id}@example.com",
                }
            }
        }
    return ev


class LambdaAuthTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_lambda_module()

    def body(self, response):
        return json.loads(response["body"])

    def test_missing_jwt_is_rejected(self):
        response = self.mod.lambda_handler(event("GET", "/tasks"), None)
        self.assertEqual(response["statusCode"], 401)
        self.assertEqual(self.body(response)["error"], "unauthorized")

    def test_created_task_is_written_under_authenticated_user(self):
        response = self.mod.lambda_handler(
            event("POST", "/tasks", "alice", {"title": "Private task"}),
            None,
        )
        self.assertEqual(response["statusCode"], 200)
        item = next(iter(self.mod.table.items.values()))
        self.assertEqual(item["PK"], "USER#alice")
        self.assertTrue(item["SK"].startswith("TASK#"))
        self.assertEqual(item["userId"], "alice")

    def test_user_cannot_update_another_users_task(self):
        create = self.mod.lambda_handler(
            event("POST", "/tasks", "alice", {"title": "Alice task"}),
            None,
        )
        task_id = self.body(create)["task"]["taskId"]
        update = self.mod.lambda_handler(
            event("POST", "/tasks", "bob", {"op": "rename", "taskId": task_id, "title": "Stolen"}),
            None,
        )
        self.assertEqual(update["statusCode"], 404)
        stored = next(iter(self.mod.table.items.values()))
        self.assertEqual(stored["title"], "Alice task")


if __name__ == "__main__":
    unittest.main()
