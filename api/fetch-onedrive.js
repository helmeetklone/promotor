// Vercel Serverless Function — jembatan buat narik file dari OneDrive/SharePoint
// dari SISI SERVER (bukan browser), biar nggak kena blokir CORS.
//
// Cara pakai (buat TES doang dulu): buka di browser
//   https://<domain-vercel-kamu>/api/fetch-onedrive?url=<share-link-di-encode>
// Kalau file-nya kebuka/ke-download, berarti teknik ini JALAN buat data kamu.
// Kalau muncul error, kita coba jalur lain (Microsoft Graph API + Azure app).

export default async function handler(req, res) {
  const shareUrl = req.query.url;
  if (!shareUrl) {
    return res.status(400).json({ error: "Tambahin ?url=<link share OneDrive> di URL-nya" });
  }

  try {
    // Teknik resmi dari Microsoft: encode link share jadi format "u!..."
    // buat dipakai di OneDrive API (kerja tanpa login utk link "Anyone").
    const base64 = Buffer.from(shareUrl, "utf-8").toString("base64");
    const encoded = "u!" + base64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
    const directUrl = `https://api.onedrive.com/v1.0/shares/${encoded}/root/content`;

    const response = await fetch(directUrl, { redirect: "follow" });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return res.status(response.status).json({
        error: `OneDrive fetch gagal (status ${response.status})`,
        detail: text.slice(0, 500),
        triedUrl: directUrl,
      });
    }

    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", "inline");
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(500).json({ error: "Exception: " + err.message });
  }
}

