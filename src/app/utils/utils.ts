import { Message } from "@langchain/langgraph-sdk";
import { supabase } from "@/lib/supabase";

export function extractStringFromMessageContent(message: Message): string {
  return typeof message.content === "string"
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .filter((c: any) => c.type === "text" || typeof c === "string")
          .map((c: any) => (typeof c === "string" ? c : c.text || ""))
          .join("")
      : "";
}

/**
 * Parse message content to extract image URLs and clean text
 * Parses the format: "Here are X imageurl(s): "url1", "url2", ..."
 * @param content - The message content string
 * @returns Object with cleanText (without image URLs) and imageUrls array
 */
export function parseImageUrlsFromContent(content: string): {
  cleanText: string;
  imageUrls: string[];
} {
  console.log("[parseImageUrlsFromContent] Starting parse:", {
    content,
  });
  // Pattern to match: \n\nHere are X imageurl(s): "url1", "url2", ...
  const imageUrlPattern = /\n\nHere are \d+ imageurl[s]?:\s*(.+?)(?:\n|$)/i;
  const match = content.match(imageUrlPattern);

  if (!match) {
    console.log("[parseImageUrlsFromContent] No match found");
    return { cleanText: content, imageUrls: [] };
  }

  // Extract URLs from the matched string
  const urlsPart = match[1];
  const urlMatches = urlsPart.match(/"([^"]+)"/g);
  const imageUrls = urlMatches
    ? urlMatches.map((url) => url.replace(/"/g, ""))
    : [];

  // Remove the image URL part from the content
  const cleanText = content.replace(match[0], "").trim();
  console.log("[parseImageUrlsFromContent] Clean text:", {
    cleanText,
  });
  console.log("[parseImageUrlsFromContent] Image URLs:", {
    imageUrls,
  });

  return { cleanText, imageUrls };
}

/**
 * Upload an image to Supabase Storage
 * @param file - The image file to upload
 * @returns Promise<string> - The public URL of the uploaded image
 * @throws Error if upload fails
 */
export async function uploadImageToSupabase(file: File): Promise<string> {
  console.log("[uploadImageToSupabase] Starting upload:", {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    timestamp: new Date().toISOString(),
  });

  try {
    // Configuration
    const bucketName = "public_bucket"; // Your Supabase bucket name
    const folderName = "chat-images"; // Folder inside the bucket for chat images

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 9);
    const fileExtension = file.name.split(".").pop();
    const uniqueFileName = `${timestamp}-${randomString}.${fileExtension}`;
    const filePath = `${folderName}/${uniqueFileName}`;

    console.log("[uploadImageToSupabase] Uploading to path:", filePath);

    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("[uploadImageToSupabase] Upload error:", {
        error: error.message,
        details: error,
      });
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    console.log("[uploadImageToSupabase] Upload successful:", {
      path: data.path,
      fullPath: data.fullPath,
    });

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    if (!urlData || !urlData.publicUrl) {
      console.error("[uploadImageToSupabase] Failed to get public URL");
      throw new Error("Failed to retrieve public URL for uploaded image");
    }

    console.log("[uploadImageToSupabase] Public URL obtained:", {
      publicUrl: urlData.publicUrl,
    });

    return urlData.publicUrl;
  } catch (error) {
    console.error("[uploadImageToSupabase] Error:", {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
