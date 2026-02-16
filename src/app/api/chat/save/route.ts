import { NextRequest, NextResponse } from "next/server";
import { getDb, getCollectionNames } from "@/lib/mongo";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, sessionId, messages } = body;

    if (!uid || !sessionId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Missing required fields: uid, sessionId, messages" },
        { status: 400 }
      );
    }

    // Save to MongoDB
    try {
      const db = await getDb();
      const { users } = getCollectionNames();
      
      // Store chat session in user document
      await db.collection(users).updateOne(
        { uid },
        {
          $set: {
            uid,
            [`axonChatSessions.${sessionId}`]: {
              sessionId,
              messages: messages.map((msg: any) => ({
                role: msg.role,
                content: msg.content,
                reasoningTitle: msg.reasoningTitle || "",
                reasoning: msg.reasoning || "",
                timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
                metadata: msg.metadata || {},
              })),
              updatedAt: Date.now(),
            },
          },
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("Failed to save chat to MongoDB:", err);
    }

    // Save to Firestore (best-effort)
    try {
      const adminDb = getAdminDb();
      if (adminDb) {
        // Save session metadata
        await adminDb
          .collection("users")
          .doc(uid)
          .collection("axonChatSessions")
          .doc(sessionId)
          .set(
            {
              sessionId,
              updatedAt: Date.now(),
              title: messages[0]?.content?.substring(0, 50) || "AxonChat",
            },
            { merge: true }
          );

        // Save individual messages
        const messagesRef = adminDb
          .collection("users")
          .doc(uid)
          .collection("axonChatSessions")
          .doc(sessionId)
          .collection("messages");

        // Clear existing messages and save new ones
        const existingSnap = await messagesRef.get();
        if (existingSnap.docs.length > 0) {
          const deleteBatch = adminDb.batch();
          existingSnap.docs.forEach((doc) => {
            deleteBatch.delete(doc.ref);
          });
          await deleteBatch.commit();
        }

        // Add new messages in batches (Firestore limit is 500 operations per batch)
        for (let i = 0; i < messages.length; i += 500) {
          const batch = adminDb.batch();
          const chunk = messages.slice(i, i + 500);
          
          chunk.forEach((msg: any, chunkIndex: number) => {
            const msgRef = messagesRef.doc();
            batch.set(msgRef, {
              role: msg.role,
              content: msg.content,
              reasoningTitle: msg.reasoningTitle || "",
              reasoning: msg.reasoning || "",
              timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
              metadata: msg.metadata || {},
              index: i + chunkIndex,
            });
          });
          
          await batch.commit();
        }
      }
    } catch (err) {
      console.error("Failed to save chat to Firestore:", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Chat save error:", error);
    return NextResponse.json(
      { error: "Failed to save chat" },
      { status: 500 }
    );
  }
}
