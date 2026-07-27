import type { ApiPackage } from "@vpc/api";
import { currentTimePackage } from "@vpc/current-time";

/**
 * The single list every transport is built from. Adding a feature package is a one-line
 * change here plus a workspace dependency in `package.json`.
 */
export const packages: readonly ApiPackage[] = [currentTimePackage];
