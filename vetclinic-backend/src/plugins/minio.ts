import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";
import { S3Client, PutObjectCommand, HeadBucketCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getMinioUser, getMinioPassword } from "../validate-env";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo

const BUCKET_NAME = "vetclinic-uploads";

export interface MinioPlugin {
  s3: S3Client;
  bucket: string;
  uploadFile: (
    key: string,
    buffer: Buffer,
    contentType: string,
  ) => Promise<{ key: string; url: string }>;
  getPresignedUrl: (key: string, expiresIn?: number) => Promise<string>;
}

async function ensureBucket(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      const { CreateBucketCommand } = await import("@aws-sdk/client-s3");
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    } else {
      console.warn("[MinIO] Impossible de vérifier/créer le bucket:", err.message || err);
    }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const endpoint = process.env.MINIO_ENDPOINT || "http://localhost:9000";
  const accessKeyId = getMinioUser();
  const secretAccessKey = getMinioPassword();

  const s3 = new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  await ensureBucket(s3, BUCKET_NAME);

  fastify.decorate("minio", {
    s3,
    bucket: BUCKET_NAME,
    uploadFile: async (key: string, buffer: Buffer, contentType: string) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return {
        key,
        url: `${endpoint}/${BUCKET_NAME}/${key}`,
      };
    },
    getPresignedUrl: async (key: string, expiresIn: number = 3600) => {
      const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
      return getSignedUrl(s3, command, { expiresIn });
    },
  } as MinioPlugin);

  fastify.log.info("[MinIO] Client initialisé — bucket: %s, endpoint: %s", BUCKET_NAME, endpoint);
});

declare module "fastify" {
  interface FastifyInstance {
    minio: MinioPlugin;
  }
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, BUCKET_NAME };
