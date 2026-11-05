#!/usr/bin/env python3
"""Run the Tectonic Control Plane server."""
import os
import sys

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

if __name__ == "__main__":
    import uvicorn
    
    # Set API key from environment or use the provided key
    # API key supports new Google AI format (AQ....)
    
    print("=" * 60)
    print("  TECTONIC CONTROL PLANE")
    print("  Governed Autonomous Execution with JIT Agent Creation")
    print("=" * 60)
    print()
    print("Server starting at: http://localhost:8081")
    print("API Documentation:  http://localhost:8081/docs")
    print("WebSocket:          ws://localhost:8081/ws")
    print()
    print("Note: Set GOOGLE_API_KEY environment variable for AI features")
    print()
    
    uvicorn.run(
        "control_plane.main:app",
        host="0.0.0.0",
        port=8081,
        reload=True,
    )
