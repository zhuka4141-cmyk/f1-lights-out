import { createHandlers } from '../server/handlers.mjs';
import { blobStore } from '../server/store.mjs';
export default createHandlers({ store: blobStore, secret: () => process.env.BLOB_READ_WRITE_TOKEN }).runs;
