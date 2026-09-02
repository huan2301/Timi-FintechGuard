from src.agents.state import AgentState


async def analyze_node(state: AgentState) -> dict:
    """Normalize the query for the bounded legacy compatibility graph."""
    query = state.get("query", "").strip()
    if not query:
        return {"error": "Yêu cầu không được để trống"}

    return {"analysis": f"Yêu cầu đã tiếp nhận: {query}"}


async def respond_node(state: AgentState) -> dict:
    """Return an explicit migration response for the legacy graph."""
    analysis = state.get("analysis", "")
    error = state.get("error")

    if error:
        return {"response": f"Lỗi: {error}"}

    return {
        "response": (
            f"{analysis}. Luồng tương thích này không thực hiện phân tích AI; "
            "hãy dùng API trợ lý hoặc đánh giá giao dịch hiện hành."
        )
    }
