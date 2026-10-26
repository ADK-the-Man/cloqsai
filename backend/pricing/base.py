"""
Base interface for cloud pricing adapters.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class PricingAdapter(ABC):
    @abstractmethod
    async def get_service_price(
        self,
        service_code: str,
        region: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Fetch pricing breakdown for a specific service in a region."""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if provider endpoint or MCP sidecar is reachable."""
        pass
