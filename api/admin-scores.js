import { createAdminHandlers } from '../server/admin-handlers.mjs';
import { blobStore, storeForVersion } from '../server/store.mjs';
export default createAdminHandlers({ store: blobStore, resolveStore: storeForVersion, secret: () => process.env.BLOB_READ_WRITE_TOKEN,
  passwordHash: () => process.env.ADMIN_PASSWORD_HASH }).scores;
