from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def ensure_review_implementation() -> None:
    original = ROOT / "scripts/pr24_finalize_review.py"
    review_test = ROOT / "nodes/Max/tests/MaxApiReviewRegression.test.ts"
    if original.exists():
        subprocess.run(["python3", str(original), "implement"], cwd=ROOT, check=True)
    elif not review_test.exists():
        raise RuntimeError("Neither the original finalizer nor its regression test is present")

    generic_path = "nodes/Max/GenericFunctions.ts"
    generic = read(generic_path)
    generic = generic.replace(
        "import { CURRENT_MAX_API_BASE_URL, normalizeMaxBaseUrl } from './MaxApiBaseUrl';",
        "import { normalizeMaxBaseUrl } from './MaxApiBaseUrl';",
    )
    generic = generic.replace("const DEFAULT_MAX_BASE_URL = CURRENT_MAX_API_BASE_URL;\n", "")
    write(generic_path, generic)

    request_path = "nodes/Max/MaxApiRequest.ts"
    request = read(request_path)
    if re.search(r"(?:export\s+)?function normalizeMaxBaseUrl\s*\(", request):
        request = request.replace("import { normalizeMaxBaseUrl } from './MaxApiBaseUrl';\n", "")
    request = request.replace(
        "import { NodeApiError, NodeOperationError } from 'n8n-workflow';",
        "import { ApplicationError, NodeApiError, NodeOperationError } from 'n8n-workflow';",
    )
    if "export function requireRecipientId" not in request:
        request += """

export function requireRecipientId(value: unknown): string {
	const recipientId = requireInt64(value, 'Recipient ID');
	if (recipientId === '0') {
		throw new ApplicationError(
			'Recipient ID must not be 0. Use chat_id or user_id from Max Trigger output.',
		);
	}
	return recipientId;
}
"""
    write(request_path, request)

    operations_path = "nodes/Max/MaxApiOperations.node.ts"
    operations = read(operations_path)
    operations = re.sub(
        r"import \{ ([^}]*) \} from 'n8n-workflow';",
        lambda match: "import { "
        + ", ".join(
            dict.fromkeys(
                [part.strip() for part in match.group(1).split(",") if part.strip()]
                + ["NodeApiError"]
            )
        )
        + " } from 'n8n-workflow';",
        operations,
        count=1,
    )
    if "import { toPunycodeUrl } from './MaxWebhookManager';" not in operations:
        operations = operations.replace(
            "import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';",
            "import { MAX_API_OPERATION_PROPERTIES } from './MaxApiOperationsDescription';\nimport { toPunycodeUrl } from './MaxWebhookManager';",
            1,
        )
    if "requireRecipientId," not in operations:
        operations = operations.replace("\trequireInt64,\n", "\trequireInt64,\n\trequireRecipientId,\n", 1)
    operations = re.sub(
        r"const recipientId = requireInt64\(\s*getParameter<unknown>\(context, 'recipientId', itemIndex, ''\),\s*'Recipient ID',\s*\);",
        "const recipientId = requireRecipientId(\n\t\tgetParameter<unknown>(context, 'recipientId', itemIndex, ''),\n\t);",
        operations,
        count=1,
    )
    operations = operations.replace(
        "if (error instanceof NodeOperationError) {",
        "if (error instanceof NodeOperationError || error instanceof NodeApiError) {",
    )
    if "const url = toPunycodeUrl(" not in operations:
        operations = re.sub(
            r"const url = requireString\(\s*getParameter<unknown>\(context, 'url', itemIndex, ''\),\s*'Webhook URL',\s*\);",
            "const url = toPunycodeUrl(\n\t\trequireString(getParameter<unknown>(context, 'url', itemIndex, ''), 'Webhook URL'),\n\t);",
            operations,
            count=1,
        )
    write(operations_path, operations)

    webhook_path = "nodes/Max/MaxWebhookManager.ts"
    webhook = read(webhook_path).replace(
        "function toPunycodeUrl(urlString: string): string {",
        "export function toPunycodeUrl(urlString: string): string {",
    )
    write(webhook_path, webhook)

    config_path = "nodes/Max/MaxTriggerConfig.ts"
    config = read(config_path)
    config = config.replace(
        "recipient?: { chat_id: number; chat_type?: string; user_id?: number };",
        "recipient?: { chat_id: number; chat_type?: string; user_id?: number; post_id?: string };",
    )
    if "post_id?: string;" not in config:
        config = config.replace("\tcomment_id?: string;\n", "\tcomment_id?: string;\n\tpost_id?: string;\n")
    if "muted_until?: number;" not in config:
        config = config.replace("\tpost_id?: string;\n", "\tpost_id?: string;\n\tmuted_until?: number;\n")
    write(config_path, config)

    credentials_path = "credentials/MaxApi.credentials.ts"
    write(
        credentials_path,
        read(credentials_path).replace("https://platform-api.max.ru", "https://platform-api2.max.ru"),
    )
    credentials_test_path = "credentials/tests/MaxApi.credentials.test.ts"
    write(
        credentials_test_path,
        read(credentials_test_path).replace(
            "https://platform-api.max.ru", "https://platform-api2.max.ru"
        ),
    )


if __name__ == "__main__":
    ensure_review_implementation()
