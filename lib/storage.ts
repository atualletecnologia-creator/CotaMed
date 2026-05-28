import { supabase } from "./supabase";

export async function uploadPdfRegistro(file: File, nomeArquivo: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new Error("Usuário não autenticado.");
  }

  const userId = authData.user.id;
  const path = `${userId}/${nomeArquivo}`;

  const { data, error } = await supabase.storage
    .from("registros-anvisa")
    .upload(path, file, {
      upsert: true,
      contentType: "application/pdf"
    });

  if (error) {
    throw error;
  }

  return data.path;
}

export async function gerarLinkTemporarioPdf(path: string) {
  const { data, error } = await supabase.storage
    .from("registros-anvisa")
    .createSignedUrl(path, 60 * 10);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}
