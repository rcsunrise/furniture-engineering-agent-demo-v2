import {
  EngineeringAlignmentSession,
  EngineeringAlignmentSessionSchema,
} from "../../shared/alignmentSession.js";

class AlignmentSessionStore {
  private sessions: Map<string, EngineeringAlignmentSession> = new Map();

  public saveSession(session: EngineeringAlignmentSession): EngineeringAlignmentSession {
    const validated = EngineeringAlignmentSessionSchema.parse(session);
    this.sessions.set(validated.sessionId, validated);
    return validated;
  }

  public getSession(sessionId: string): EngineeringAlignmentSession | undefined {
    return this.sessions.get(sessionId);
  }

  public listSessions(): EngineeringAlignmentSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public updateSession(
    sessionId: string,
    updates: Partial<EngineeringAlignmentSession>
  ): EngineeringAlignmentSession | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;

    const merged: EngineeringAlignmentSession = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
      productionTruth: false,
    };

    const validated = EngineeringAlignmentSessionSchema.parse(merged);
    this.sessions.set(sessionId, validated);
    return validated;
  }

  public deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  public clear(): void {
    this.sessions.clear();
  }
}

export const alignmentSessionStore = new AlignmentSessionStore();
