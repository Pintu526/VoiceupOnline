import type {
  CanonicalLocationNode,
  LocationResolutionResult,
  LocationValidationResult
} from "./LocationApiTypes.ts";
import {
  LOCATION_API_V1_NAMESPACE,
  locationApiV1SecurityContract,
  type LocationApiV1Error,
  type LocationApiV1Request,
  type LocationApiV1Response,
  type LocationApiV1Success
} from "./LocationApiV1Contract.ts";
import { RepositoryLocationService } from "./RepositoryLocationService.ts";

/**
 * Async, repository-backed v1 service. This is the production-candidate path:
 * it imports no generated Odisha dataset or in-memory canonical dataset.
 */
export class RepositoryLocationApiV1 {
  private readonly service: RepositoryLocationService;

  constructor(service: RepositoryLocationService) {
    this.service = service;
  }

  async handle(request: LocationApiV1Request): Promise<LocationApiV1Response> {
    const metadata = await this.service.metadata();
    if (!metadata) return this.notFound("No canonical dataset matches the explicit repository selection.", "unavailable");
    switch (request.operation) {
      case "metadata":
        return this.ok(metadata.datasetVersion, {
          namespace: LOCATION_API_V1_NAMESPACE,
          datasetVersion: metadata.datasetVersion,
          source: metadata.source,
          readOnly: true,
          security: locationApiV1SecurityContract
        });
      case "node": {
        const node = await this.service.getNode(request.nodeId);
        return node ? this.ok(metadata.datasetVersion, node) : this.notFound(`Canonical node '${request.nodeId}' was not found.`, metadata.datasetVersion);
      }
      case "officialCode":
        return this.ok(metadata.datasetVersion, await this.service.resolve({ ...request.request, officialCode: request.officialCode }));
      case "children": {
        const node = await this.service.getNode(request.nodeId);
        return node
          ? this.ok(metadata.datasetVersion, { nodeId: node.nodeId, nodes: await this.service.getChildren(node.nodeId) })
          : this.notFound(`Canonical node '${request.nodeId}' was not found.`, metadata.datasetVersion);
      }
      case "parents": {
        const node = await this.service.getNode(request.nodeId);
        return node
          ? this.ok(metadata.datasetVersion, { nodeId: node.nodeId, parents: await this.service.getParents(node.nodeId) })
          : this.notFound(`Canonical node '${request.nodeId}' was not found.`, metadata.datasetVersion);
      }
      case "lineage": {
        const node = await this.service.getNode(request.nodeId);
        return node
          ? this.ok(metadata.datasetVersion, { nodeId: node.nodeId, lineage: await this.service.getLineage(node.nodeId) })
          : this.notFound(`Canonical node '${request.nodeId}' was not found.`, metadata.datasetVersion);
      }
      case "search":
      case "resolve":
        return this.ok(metadata.datasetVersion, await this.service.resolve(request.request));
      case "validate":
        return this.ok(metadata.datasetVersion, await this.service.validate(request.request));
      case "descendant": {
        const [node, ancestor] = await Promise.all([
          this.service.getNode(request.nodeId),
          this.service.getNode(request.ancestorNodeId)
        ]);
        return node && ancestor
          ? this.ok(metadata.datasetVersion, { nodeId: node.nodeId, ancestorNodeId: ancestor.nodeId, descendant: await this.service.isDescendantOf(node.nodeId, ancestor.nodeId) })
          : this.notFound("Both nodeId and ancestorNodeId must identify canonical nodes.", metadata.datasetVersion);
      }
      case "relationship": {
        const [child, parent] = await Promise.all([
          this.service.getNode(request.childNodeId),
          this.service.getNode(request.parentNodeId)
        ]);
        return child && parent
          ? this.ok(metadata.datasetVersion, { childNodeId: child.nodeId, parentNodeId: parent.nodeId, represented: await this.service.hasOfficialRelationship(child.nodeId, parent.nodeId) })
          : this.notFound("Both childNodeId and parentNodeId must identify canonical nodes.", metadata.datasetVersion);
      }
    }
  }

  private ok<T>(datasetVersion: string, data: T): LocationApiV1Success<T> {
    return { httpStatus: 200, body: { apiVersion: "v1", datasetVersion, data } };
  }

  private notFound(message: string, datasetVersion: string): LocationApiV1Error {
    return {
      httpStatus: 404,
      body: { apiVersion: "v1", datasetVersion, error: { code: "not_found", message } }
    };
  }
}

export type RepositoryLocationApiV1NodeResponse = LocationApiV1Success<CanonicalLocationNode> | LocationApiV1Error;
export type RepositoryLocationApiV1ResolutionResponse = LocationApiV1Success<LocationResolutionResult>;
export type RepositoryLocationApiV1ValidationResponse = LocationApiV1Success<LocationValidationResult>;
