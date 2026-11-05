"""Evidence Fabric - Universal event emitter and telemetry model."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Any, Callable
import hashlib
import json
from ulid import ULID

from .enums import EventType


@dataclass
class EvidenceEvent:
    """An immutable evidence event in the fabric."""
    id: str = field(default_factory=lambda: str(ULID()))
    event_type: EventType = EventType.MISSION_CREATED
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
    trace_id: str = ""
    span_id: str = field(default_factory=lambda: str(ULID())[:8])
    mission_id: str | None = None
    agent_id: str | None = None
    task_id: str | None = None
    policy_version: str = "1.0.0"
    input_hash: str | None = None
    output_hash: str | None = None
    decision_rationale: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    severity: str = "info"  # info, warning, error, critical
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(), "trace_id": self.trace_id,
            "span_id": self.span_id, "mission_id": self.mission_id,
            "agent_id": self.agent_id, "task_id": self.task_id,
            "policy_version": self.policy_version, "input_hash": self.input_hash,
            "output_hash": self.output_hash, "decision_rationale": self.decision_rationale,
            "payload": self.payload, "severity": self.severity,
        }


class EvidenceFabric:
    """Universal event emitter for the control plane."""
    
    def __init__(self):
        self._events: list[EvidenceEvent] = []
        self._subscribers: list[Callable[[EvidenceEvent], None]] = []
        self._async_subscribers: list[Callable[[EvidenceEvent], Any]] = []
        
    def subscribe(self, callback: Callable[[EvidenceEvent], None]) -> None:
        """Subscribe to evidence events synchronously."""
        self._subscribers.append(callback)
        
    def subscribe_async(self, callback: Callable[[EvidenceEvent], Any]) -> None:
        """Subscribe to evidence events asynchronously."""
        self._async_subscribers.append(callback)
        
    def emit(self, event: EvidenceEvent) -> None:
        """Emit an evidence event."""
        self._events.append(event)
        for callback in self._subscribers:
            try:
                callback(event)
            except Exception:
                pass  # Don't let subscriber errors break the fabric
                
    async def emit_async(self, event: EvidenceEvent) -> None:
        """Emit an evidence event with async subscriber notification."""
        self._events.append(event)
        for callback in self._subscribers:
            try:
                callback(event)
            except Exception:
                pass
        for callback in self._async_subscribers:
            try:
                await callback(event)
            except Exception:
                pass
    
    def get_events(self, trace_id: str | None = None, mission_id: str | None = None,
                   event_type: EventType | None = None) -> list[EvidenceEvent]:
        """Query events with optional filters."""
        result = self._events
        if trace_id:
            result = [e for e in result if e.trace_id == trace_id]
        if mission_id:
            result = [e for e in result if e.mission_id == mission_id]
        if event_type:
            result = [e for e in result if e.event_type == event_type]
        return result
    
    def get_mission_evidence_pack(self, mission_id: str) -> dict[str, Any]:
        """Generate a regulator-ready evidence pack for a mission."""
        events = self.get_events(mission_id=mission_id)
        return {
            "mission_id": mission_id,
            "event_count": len(events),
            "events": [e.to_dict() for e in events],
            "generated_at": datetime.now(UTC).isoformat(),
        }
    
    @staticmethod
    def compute_hash(data: Any) -> str:
        """Compute hash for input/output integrity."""
        return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:16]


# Global singleton
_evidence_fabric: EvidenceFabric | None = None


def get_evidence_fabric() -> EvidenceFabric:
    """Get the global evidence fabric instance."""
    global _evidence_fabric
    if _evidence_fabric is None:
        _evidence_fabric = EvidenceFabric()
    return _evidence_fabric
