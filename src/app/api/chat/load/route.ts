import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    const sessionId = req.nextUrl.searchParams.get("sessionId") || "default";

    if (!uid) {
      return NextResponse.json(
        { error: "Missing uid parameter" },
        { status: 400 }
      );
    }

    let messages: any[] = [];
    let sessionData: any = null;

    // Try MongoDB first
    try {
      const db = await getDb();
      const { users } = getCollectionNames();
      const doc = await db.collection(users).findOne({ uid });
      
      if (doc && (doc as any).axonChatSessions?.[sessionId]) {
        sessionData = (doc as any).axonChatSessions[sessionId];
        messages = (sessionData.messages || []).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp || Date.now()),
          metadata: msg.metadata || {},
        }));
      }
    } catch (err) {
      console.error("Failed to load chat from MongoDB:", err);
    }

    // Fallback to Firestore
    if (messages.length === 0) {
      try {
        const adminDb = getAdminDb();
        if (adminDb) {
          // Try loading from messages subcollection first
          const messagesSnap = await adminDb
            .collection("users")
            .doc(uid)
            .collection("axonChatSessions")
            .doc(sessionId)
            .collection("messages")
            .orderBy("index", "asc")
            .get();
          
          if (!messagesSnap.empty) {
            messages = messagesSnap.docs.map((doc) => {
              const data = doc.data();
              return {
                role: data.role,
                content: data.content,
                timestamp: new Date(data.timestamp || Date.now()),
                metadata: data.metadata || {},
              };
            });
          } else {
            // Fallback to session document
            const snap = await adminDb
              .collection("users")
              .doc(uid)
              .collection("axonChatSessions")
              .doc(sessionId)
              .get();
            
            if (snap.exists) {
              sessionData = snap.data();
            }
          }
        }
      } catch (err) {
        console.error("Failed to load chat from Firestore:", err);
      }
    }

    return NextResponse.json({
      messages,
      sessionId,
      updatedAt: sessionData?.updatedAt || null,
    });
  } catch (error) {
    console.error("Chat load error:", error);
    return NextResponse.json(
      { error: "Failed to load chat" },
      { status: 500 }
    );
  }
}
