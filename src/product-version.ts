import packageJson from "../package.json" with { type: "json" };

/** One product version shared by the CLI and Native App Server handshake. */
export const PRODUCT_VERSION: string = packageJson.version;
