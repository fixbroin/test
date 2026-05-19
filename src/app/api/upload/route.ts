
import { type NextRequest, NextResponse } from 'next/server';
import type { File } from 'formidable';
import formidable from 'formidable';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { nanoid } from 'nanoid';

// Helper to parse form data
async function parseForm(req: NextRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  const contentType = req.headers.get('content-type');
  if (!contentType || !contentType.includes('multipart/form-data')) {
    throw new Error('Invalid content type for form data');
  }

  // Convert NextRequest to Node.js IncomingMessage like object for formidable
  const readableStream = req.body as ReadableStream<Uint8Array> | null;
  if (!readableStream) {
    throw new Error('Request body is not a readable stream');
  }
  
  // Create a mock Node.js request object
  const nodeReq = {
    headers: Object.fromEntries(req.headers.entries()),
    // Pipe the stream directly
    pipe: (dest: any) => {
      const reader = readableStream.getReader();
      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) {
            dest.end();
            return;
          }
          dest.write(value);
          pump();
        }).catch(err => {
          console.error("Error reading stream for formidable:", err);
          dest.emit('error', err); 
        });
      }
      pump();
      return dest;
    },
    on: (event: string, listener: (...args: any[]) => void) => {
      // Mock event listener for formidable compatibility if needed
      // For basic uploads, just providing headers and pipe might be enough
    },
    // Add any other properties formidable might expect if errors occur
  } as any;


  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
    });

    form.parse(nodeReq, (err, fields, files) => {
      if (err) {
        console.error('Error parsing form data:', err);
        return reject(err);
      }
      resolve({ fields, files });
    });
  });
}


// Initialize Firebase Admin SDK
try {
  if (!getApps().length) {
    const serviceAccountString = process.env.FIREBASE_ADMIN_SDK_CONFIG;
    if (!serviceAccountString) {
      throw new Error('FIREBASE_ADMIN_SDK_CONFIG environment variable is not set.');
    }
    const serviceAccount = JSON.parse(serviceAccountString);
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`, // Or your specific bucket name
    });
    console.log('Firebase Admin SDK initialized successfully in /api/upload.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin SDK in /api/upload:', error);
  // This error will likely cause subsequent operations to fail
}


export async function POST(req: NextRequest) {
  if (!getApps().length || !getApps()[0]) {
    return NextResponse.json({ success: false, error: 'Firebase Admin SDK not initialized. Check server logs.' }, { status: 500 });
  }
  
  try {
    const { files, fields } = await parseForm(req);
    
    const file = (files.file?.[0] || files.image?.[0]) as File | undefined;
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded or file input name is not "file" or "image".' }, { status: 400 });
    }

    // Determine upload path from form fields or use a default
    // Client forms (CategoryForm, PopupForm) might send 'uploadPath'
    const uploadPathField = fields.uploadPath?.[0] || 'general-uploads'; // Default if not provided
    const sanitizedUploadPath = uploadPathField.replace(/[^a-zA-Z0-9_/-]/g, ''); // Basic sanitization
    
    const originalFilename = file.originalFilename || 'upload';
    const extension = originalFilename.includes('.') ? originalFilename.substring(originalFilename.lastIndexOf('.')) : '';
    const randomFileName = `${nanoid()}${extension}`;
    const destinationPath = `public/uploads/${sanitizedUploadPath}/${randomFileName}`;

    const bucket = getStorage().bucket();
    await bucket.upload(file.filepath, {
      destination: destinationPath,
      metadata: {
        contentType: file.mimetype,
        // Optional: set cache control for public assets
        cacheControl: 'public, max-age=31536000', 
      },
    } as any);

    // Make the file public (if it's intended for public access)
    const uploadedFile = bucket.file(destinationPath);
    await uploadedFile.makePublic();
    const publicUrl = uploadedFile.publicUrl();
    // Alternative for signed URLs if files are not public:
    // const [signedUrl] = await uploadedFile.getSignedUrl({ action: 'read', expires: '03-01-2500' });

    return NextResponse.json({ success: true, url: publicUrl, originalFilename: file.originalFilename });

  } catch (error: any) {
    console.error('Error in /api/upload:', error);
    // Check if the error is from formidable (e.g., file size limit)
    if (error.httpCode && error.message) {
        return NextResponse.json({ success: false, error: `Upload error: ${error.message}` }, { status: error.httpCode });
    }
    return NextResponse.json({ success: false, error: `Server error: ${error.message || 'Failed to upload file.'}` }, { status: 500 });
  }
}

// To prevent issues with Next.js trying to parse the body for GET, HEAD, etc.
// If you only expect POST for this route.
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
// Add OPTIONS if needed by CORS preflight, though Next.js often handles this.
// export async function OPTIONS() {
//   return new NextResponse(null, { status: 204 });
// }

// This tells Next.js that this route should be treated as dynamic
// and not statically rendered at build time. It also ensures that
// req.body can be streamed correctly for formidable.
export const dynamic = 'force-dynamic';

