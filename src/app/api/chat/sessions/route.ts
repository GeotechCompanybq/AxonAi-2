import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");

    if (!uid) {
      return NextResponse.json(
        { error: "Missing uid parameter" },
        { status: 400 }
      );
    }

    let sessions: any[] = [];

    // Try MongoDB first
    try {
      const db = await getDb();
      const { users } = getCollectionNames();
      const doc = await db.collection(users).findOne({ uid });
      
      if (doc && (doc as any).axonChatSessions) {
        const chatSessions = (doc as any).axonChatSessions;
        sessions = Object.entries(chatSessions).map(([sessionId, data]: [string, any]) => ({
          sessionId,
          updatedAt: data.updatedAt || 0,
          messageCount: data.messages?.length || 0,
        }));
        // Sort by updatedAt descending
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch (err) {
      console.error("Failed to load sessions from MongoDB:", err);
    }

    // Fallback to Firestore
    if (sessions.length === 0) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          const snap = await adminDb
            .collection("users")
            .doc(uid)
            .collection("axonChatSessions")
            .get();
          
          sessions = snap.docs.map((doc) => {
            const data = doc.data();
            return {
              sessionId: doc.id,
              updatedAt: data.updatedAt || 0,
              messageCount: data.messages?.length || 0,
            };
          });
          // Sort by updatedAt descending
          sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        }
      } catch (err) {
        console.error("Failed to load sessions from Firestore:", err);
      }
    }

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Chat sessions error:", error);
    return NextResponse.json(
      { error: "Failed to load chat sessions" },
      { status: 500 }
    );
  }
}
