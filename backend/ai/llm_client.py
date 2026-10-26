"""
Anthropic Claude LLM client with structured JSON output via tool calling.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


class LLMConfigError(Exception):
    """Raised when the LLM API key is not configured."""
    pass


class LLMResponseError(Exception):
    """Raised when the LLM returns an unexpected or invalid response."""
    pass


def normalize_model_name(raw_name: str) -> str:
    name = (raw_name or "").strip()
    if not name:
        return "claude-haiku-5-5"
    return name


class UnifiedLLMClient:
    """
    Unified client supporting both official Anthropic API and OpenAI-compatible
    gateways (such as KodeKloud, LiteLLM, vLLM, OpenRouter, Azure OpenAI).
    """

    def __init__(self):
        if not settings.ANTHROPIC_API_KEY:
            raise LLMConfigError(
                "ANTHROPIC_API_KEY is not configured. "
                "Set this environment variable to enable AI features."
            )
        self.api_key = (settings.ANTHROPIC_API_KEY or "").strip().strip("'\"")
        self.base_url = (getattr(settings, "ANTHROPIC_BASE_URL", "") or "https://api.anthropic.com/v1").rstrip("/")
        self.model = normalize_model_name(settings.ANTHROPIC_MODEL)
        
        # Check if base_url is an OpenAI-compatible proxy or official Anthropic
        self.is_anthropic_native = "anthropic.com" in self.base_url

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        response_schema: Optional[Dict[str, Any]] = None,
        tool_name: str = "respond",
        tool_description: str = "Provide your structured response",
        max_tokens: int = settings.LLM_MAX_TOKENS,
        temperature: float = 0.1,
        timeout: int = settings.LLM_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        """
        Send a chat completion request with structured tool-calling.
        """
        if self.is_anthropic_native:
            return await self._call_anthropic(
                messages=messages,
                system_prompt=system_prompt,
                response_schema=response_schema,
                tool_name=tool_name,
                tool_description=tool_description,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout,
            )
        else:
            return await self._call_openai_compatible(
                messages=messages,
                system_prompt=system_prompt,
                response_schema=response_schema,
                tool_name=tool_name,
                tool_description=tool_description,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout,
            )

    async def _call_openai_compatible(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        response_schema: Optional[Dict[str, Any]],
        tool_name: str,
        tool_description: str,
        max_tokens: int,
        temperature: float,
        timeout: int,
    ) -> Dict[str, Any]:
        endpoint = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        formatted_messages = []
        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})
        formatted_messages.extend(messages)

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": formatted_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if response_schema:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "description": tool_description,
                        "parameters": response_schema,
                    },
                }
            ]
            payload["tool_choice"] = {
                "type": "function",
                "function": {"name": tool_name},
            }

        last_error: Optional[Exception] = None
        for attempt in range(1, settings.LLM_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(endpoint, headers=headers, json=payload)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("retry-after", 5))
                    logger.warning(f"Rate limited. Retrying in {retry_after}s (attempt {attempt})")
                    await asyncio.sleep(retry_after)
                    last_error = Exception(f"Rate limited: {response.text}")
                    continue

                if response.status_code >= 500:
                    wait = 2 ** attempt
                    logger.warning(f"Gateway error {response.status_code}. Retrying in {wait}s")
                    await asyncio.sleep(wait)
                    last_error = Exception(f"Server error {response.status_code}: {response.text}")
                    continue

                if response.status_code != 200:
                    raise LLMResponseError(
                        f"LLM API returned {response.status_code}: {response.text[:500]}"
                    )

                data = response.json()
                choice = (data.get("choices") or [{}])[0]
                message = choice.get("message") or {}

                # 1. Check if tool calls exist
                tool_calls = message.get("tool_calls") or []
                for tc in tool_calls:
                    fn = tc.get("function") or {}
                    if fn.get("name") == tool_name:
                        args = fn.get("arguments", "{}")
                        if isinstance(args, str):
                            return json.loads(args)
                        return args

                # 2. Check if content has json
                content = message.get("content") or ""
                if response_schema and content:
                    clean = content.strip()
                    if clean.startswith("```json"):
                        clean = clean[7:]
                    if clean.startswith("```"):
                        clean = clean[3:]
                    if clean.endswith("```"):
                        clean = clean[:-3]
                    try:
                        return json.loads(clean.strip())
                    except Exception:
                        pass

                if response_schema:
                    raise LLMResponseError(f"Expected tool call {tool_name} but got: {content[:300]}")

                return {"text": content}

            except (httpx.TimeoutException, httpx.ConnectError) as e:
                wait = 2 ** attempt
                logger.warning(f"Network error calling LLM API: {e}. Retrying in {wait}s (attempt {attempt})")
                await asyncio.sleep(wait)
                last_error = e
                continue

        raise last_error or LLMResponseError("All retries exhausted")

    async def _call_anthropic(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        response_schema: Optional[Dict[str, Any]],
        tool_name: str,
        tool_description: str,
        max_tokens: int,
        temperature: float,
        timeout: int,
    ) -> Dict[str, Any]:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        endpoint = f"{self.base_url}/messages"

        payload: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
            "temperature": temperature,
        }

        if response_schema:
            payload["tools"] = [
                {
                    "name": tool_name,
                    "description": tool_description,
                    "input_schema": response_schema,
                }
            ]
            payload["tool_choice"] = {"type": "tool", "name": tool_name}

        last_error: Optional[Exception] = None
        for attempt in range(1, settings.LLM_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(endpoint, headers=headers, json=payload)

                if response.status_code == 429:
                    retry_after = int(response.headers.get("retry-after", 10))
                    logger.warning(f"Rate limited by Anthropic API. Retrying in {retry_after}s")
                    await asyncio.sleep(retry_after)
                    last_error = Exception(f"Rate limited: {response.text}")
                    continue

                if response.status_code >= 500:
                    wait = 2 ** attempt
                    logger.warning(f"Anthropic API server error {response.status_code}. Retrying in {wait}s")
                    await asyncio.sleep(wait)
                    last_error = Exception(f"Server error {response.status_code}: {response.text}")
                    continue

                if response.status_code != 200:
                    raise LLMResponseError(
                        f"Anthropic API returned {response.status_code}: {response.text[:500]}"
                    )

                data = response.json()

                if response_schema:
                    for block in data.get("content", []):
                        if block.get("type") == "tool_use" and block.get("name") == tool_name:
                            return block["input"]
                    raise LLMResponseError("Expected tool_use response block not found in Anthropic response")

                for block in data.get("content", []):
                    if block.get("type") == "text":
                        return {"text": block["text"]}

                raise LLMResponseError("No text or tool_use content block found in response")

            except (httpx.TimeoutException, httpx.ConnectError) as e:
                wait = 2 ** attempt
                logger.warning(f"Network error calling Anthropic API: {e}. Retrying in {wait}s")
                await asyncio.sleep(wait)
                last_error = e
                continue

        raise last_error or LLMResponseError("All retries exhausted")


# Backward compatibility alias
AnthropicClient = UnifiedLLMClient


def get_llm_client() -> UnifiedLLMClient:
    """Get the LLM client."""
    return UnifiedLLMClient()
