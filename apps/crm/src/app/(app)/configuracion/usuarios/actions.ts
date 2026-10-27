"use server";

import type { Role } from "@tekinsof/core/auth/permissions";
import { getDb } from "@tekinsof/core/db/client";
import type { Result } from "@tekinsof/core/result";
import {
  deactivateUser,
  inviteUser,
  reactivateUser,
  setUserRole,
} from "@tekinsof/core/users/users";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/actor";
import { getEnv } from "@/lib/env";

const PATH = "/configuracion/usuarios";

export async function inviteAction(input: {
  email: string;
  role: string;
}): Promise<Result<{ invitationId: string }>> {
  const actor = await authorize("users.manage");
  if (!actor.ok) return actor;
  const result = await inviteUser(getDb(), actor.data, input as { email: string; role: Role }, {
    allowedDomain: getEnv().ALLOWED_EMAIL_DOMAIN,
  });
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function setRoleAction(input: {
  userId: string;
  role: string;
}): Promise<Result<{ userId: string; role: Role }>> {
  const actor = await authorize("users.manage");
  if (!actor.ok) return actor;
  const result = await setUserRole(getDb(), actor.data, input as { userId: string; role: Role });
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function toggleActiveAction(input: {
  userId: string;
  active: boolean;
}): Promise<Result<{ userId: string }>> {
  const actor = await authorize("users.manage");
  if (!actor.ok) return actor;
  const result = input.active
    ? await reactivateUser(getDb(), actor.data, { userId: input.userId })
    : await deactivateUser(getDb(), actor.data, { userId: input.userId });
  if (result.ok) revalidatePath(PATH);
  return result;
}
