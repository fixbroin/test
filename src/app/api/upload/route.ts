// src/app/api/upload/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const uploadPath = (formData.get('uploadPath') as string) || 'general';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Clean destination subfolder under public/uploads/
    const cleanSubfolder = uploadPath.replace(/^[/\\]+|[/\\]+$/g, '').replace(/[/\\]+/g, '/');
    const targetDir = path.join(process.cwd(), 'public', 'uploads', cleanSubfolder);

    await fs.mkdir(targetDir, { recursive: true });

    // Generate unique filename preserving original extension
    const ext = path.extname(file.name) || '.jpg';
    const filename = `${Date.now()}-${nanoid(8)}${ext}`;
    const fullPath = path.join(targetDir, filename);

    await fs.writeFile(fullPath, buffer);

    // Build public URL
    const publicUrl = `/uploads/${cleanSubfolder ? cleanSubfolder + '/' : ''}${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: filename,
      path: publicUrl
    });
  } catch (error: any) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ success: false, error: error.message || 'Upload failed' }, { status: 500 });
  }
}
