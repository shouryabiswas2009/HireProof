"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SavedCheck = {
  id: string;
  created_at: string;
  title: string | null;
  score: number;
  band: string;
  word_count: number | null;
  top_signal: string | null;
};

/* WHAT IS STORED, AND WHAT IS NOT.
 *
 * The posting text is not saved. A saved check keeps the score, the band,
 * the word count, the strongest signal, and the first line as a label -
 * enough to recognise an entry weeks later, and nothing that would mean
 * uploading somebody's paste to keep a bookmark.
 *
 * It is also the honest version of what the account is for. Scoring never
 * needed a server; remembering does. */
export async function saveCheck(input: {
  score: number;
  band: string;
  wordCount: number;
  title: string;
  topSignal: string | null;
}): Promise<{ error?: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be signed in to save a check." };

  const { error } = await supabase.from("checks").insert({
    user_id: user.id,
    title: input.title || null,
    score: input.score,
    band: input.band,
    word_count: input.wordCount,
    top_signal: input.topSignal,
  });

  if (error) return { error: error.message };

  revalidatePath("/history");
}

export async function listChecks(): Promise<SavedCheck[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("checks")
    .select("id, created_at, title, score, band, word_count, top_signal")
    .order("created_at", { ascending: false })
    .limit(100);

  // Row-level security already scopes this to the signed-in user, so
  // there is no user_id filter here to forget to apply.
  if (error) return [];
  return data as SavedCheck[];
}

export async function deleteCheck(id: string) {
  const supabase = await createClient();
  await supabase.from("checks").delete().eq("id", id);
  revalidatePath("/history");
}
