import { createAdminHandlers } from '../server/admin-handlers.mjs';
import { blobStore } from '../server/store.mjs';
export default createAdminHandlers({ store: blobStore, secret: () => process.env.BLOB_READ_WRITE_TOKEN,
  passwordHash: () => process.env.ADMIN_PASSWORD_HASH }).session;
