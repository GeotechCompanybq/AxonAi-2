import { adminDb, adminFieldValue } from "@/lib/firebase-admin";

type UpsertTeamsLinkArgs = {
  tenantId: string;
  teamsUserId: string;
  axonUid: string;
  orgId: string;
};

type GetTeamsLinkArgs = {
  tenantId: string;
  teamsUserId: string;
};

export type TeamsLink = {
  tenantId: string;
  teamsUserId: string;
  axonUid: string;
  orgId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const COLLECTION = "teams_links";

function buildDocId({ tenantId, teamsUserId }: GetTeamsLinkArgs): string {
  return `${tenantId}:${teamsUserId}`;
}

export async function upsertTeamsLink(args: UpsertTeamsLinkArgs) {
  const { tenantId, teamsUserId, axonUid, orgId } = args;
  if (!tenantId || !teamsUserId || !axonUid || !orgId) {
    throw new Error("Missing required fields for teams link");
  }

  const docId = buildDocId({ tenantId, teamsUserId });

  await adminDb.collection(COLLECTION).doc(docId).set(
    {
      tenantId,
      teamsUserId,
      axonUid,
      orgId,
      updatedAt: adminFieldValue.serverTimestamp(),
      createdAt: adminFieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getTeamsLink(
  args: GetTeamsLinkArgs
): Promise<TeamsLink | null> {
  const { tenantId, teamsUserId } = args;
  if (!tenantId || !teamsUserId) return null;

  const docId = buildDocId({ tenantId, teamsUserId });
  const snap = await adminDb.collection(COLLECTION).doc(docId).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as TeamsLink) };
}

