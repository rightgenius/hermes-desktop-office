#!/usr/bin/env python3
"""
Unit tests for agent-bridge.py error classification.
Tests by parsing the source code and executing the logic directly.
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BRIDGE = REPO_ROOT / "src" / "main" / "agent-bridge.py"


def extract_error_maps(source):
    """Extract ERROR_TYPE_MAP and RETRYABLE_CATEGORIES from bridge source."""
    # Extract ERROR_TYPE_MAP
    error_map = {}
    map_match = re.search(r'_ERROR_TYPE_MAP\s*=\s*\{(.*?)\n\}', source, re.DOTALL)
    if map_match:
        map_content = map_match.group(1)
        # Parse entries like: "401": ("auth_failed", "认证失败", "...")
        entries = re.findall(r'"([^"]+)":\s*\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)', map_content)
        for key, cat, title, detail in entries:
            error_map[key] = (cat, title, detail)
    
    # Extract RETRYABLE_CATEGORIES
    retryable = set()
    retry_match = re.search(r'_RETRYABLE_CATEGORIES\s*=\s*\{(.*?)\}', source, re.DOTALL)
    if retry_match:
        categories = re.findall(r'"([^"]+)"', retry_match.group(1))
        retryable = set(categories)
    
    return error_map, retryable


def classify_error(error_msg, error_map, retryable_categories):
    """Classify an error message using the same logic as bridge."""
    msg_lower = str(error_msg).lower()
    
    # Check HTTP status codes
    for code in ["401", "402", "429", "500", "502", "503", "504"]:
        if code in msg_lower:
            if code in error_map:
                cat, title, detail = error_map[code]
                return {
                    "type": "api_error",
                    "category": cat,
                    "title": title,
                    "detail": detail,
                    "retryable": cat in retryable_categories
                }
    
    # Match error patterns
    for key, (cat, title, detail) in error_map.items():
        if key.lower() in msg_lower:
            return {
                "type": "api_error",
                "category": cat,
                "title": title,
                "detail": detail,
                "retryable": cat in retryable_categories
            }
    
    # Default error
    return {
        "type": "api_error",
        "category": "unknown",
        "title": "请求失败",
        "detail": "发生未知错误，请查看详情或重试",
        "retryable": False
    }


def run_tests():
    """Run all tests."""
    source = BRIDGE.read_text()
    error_map, retryable_categories = extract_error_maps(source)
    
    tests = [
        ("rate_limit 429", "429 rate limit exceeded", "rate_limit", True),
        ("rate_limit text", "rate_limit_exceeded", "rate_limit", True),
        ("too many requests", "too many requests", "rate_limit", True),
        ("auth 401", "401 Unauthorized", "auth_failed", False),
        ("auth api key", "invalid api key", "auth_failed", False),
        ("auth unauthorized", "unauthorized access", "auth_failed", False),
        ("timeout", "Request timeout", "timeout", True),
        ("timeout read", "read timed out", "timeout", True),
        ("connection refused", "connection refused", "connection", True),
        ("connection reset", "connection reset", "connection", True),
        ("proxy error", "proxy error", "proxy", True),
        ("service unavailable 503", "503 Service Unavailable", "service_unavailable", True),
        ("service overloaded", "service overloaded", "service_overloaded", True),
        ("model overloaded", "model overloaded", "service_overloaded", True),
        ("context length", "context_length_exceeded", "context_length", False),
        ("token limit", "token limit exceeded", "context_length", False),
        ("insufficient quota 402", "402 Payment Required", "insufficient_quota", False),
        ("quota", "quota exceeded", "insufficient_quota", False),
        ("balance", "insufficient balance", "insufficient_quota", False),
        ("billing", "billing limit", "insufficient_quota", False),
        ("model not found", "model_not_found error", "model_not_found", False),
        ("model not found text", "model not found", "model_not_found", False),
        ("gateway 502", "502 bad gateway", "gateway_error", True),
        ("gateway 504", "504 gateway timeout", "gateway_timeout", True),
        ("server error 500", "500 server error", "server_error", True),
        ("unknown error", "some random error", "unknown", False),
    ]
    
    passed = 0
    failed = 0
    
    for name, error_msg, expected_category, expected_retryable in tests:
        try:
            result = classify_error(error_msg, error_map, retryable_categories)
            assert result["category"] == expected_category, f"Category: {result['category']} != {expected_category}"
            assert result["retryable"] == expected_retryable, f"Retryable: {result['retryable']} != {expected_retryable}"
            assert result["type"] == "api_error"
            print(f"✓ {name}")
            passed += 1
        except AssertionError as e:
            print(f"✗ {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ {name}: {e}")
            failed += 1
    
    # Test retryable categories
    print(f"\n✓ Found {len(error_map)} error patterns")
    print(f"✓ Found {len(retryable_categories)} retryable categories: {sorted(retryable_categories)}")
    
    print(f"\n{passed} passed, {failed} failed")
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
