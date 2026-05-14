import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'omnea-public-api-ultm/1.0.0 (api/6.1.3)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Update a purchase order. **Deprecated**: Use the extended
   * `/v1/purchase-orders/{purchaseOrderId}` endpoint supporting additional properties
   * instead.
   *
   * @summary Update a purchase order
   * @throws FetchError<400, types.UpdatePurchaseOrderResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePurchaseOrderResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePurchaseOrderResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePurchaseOrderResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePurchaseOrderResponse500> UnknownServerError
   */
  updatePurchaseOrder(body: types.UpdatePurchaseOrderBodyParam, metadata: types.UpdatePurchaseOrderMetadataParam): Promise<FetchResponse<200, types.UpdatePurchaseOrderResponse200>> {
    return this.core.fetch('/public/v0/purchase-orders/{purchaseOrderId}', 'patch', body, metadata);
  }

  /**
   * Get a paginated list of subsidiaries
   *
   * @summary List subsidiaries
   * @throws FetchError<400, types.GetSubsidiariesResponse400> BadRequestError
   * @throws FetchError<401, types.GetSubsidiariesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSubsidiariesResponse403> ForbiddenError
   * @throws FetchError<500, types.GetSubsidiariesResponse500> UnknownServerError
   */
  getSubsidiaries(metadata?: types.GetSubsidiariesMetadataParam): Promise<FetchResponse<200, types.GetSubsidiariesResponse200>> {
    return this.core.fetch('/v1/subsidiaries', 'get', metadata);
  }

  /**
   * Get a subsidiary by ID
   *
   * @summary Get a subsidiary by ID
   * @throws FetchError<400, types.GetSubsidiaryByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSubsidiaryByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSubsidiaryByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSubsidiaryByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSubsidiaryByIdResponse500> UnknownServerError
   */
  getSubsidiaryById(metadata: types.GetSubsidiaryByIdMetadataParam): Promise<FetchResponse<200, types.GetSubsidiaryByIdResponse200>> {
    return this.core.fetch('/v1/subsidiaries/{subsidiaryId}', 'get', metadata);
  }

  /**
   * Update an existing subsidiary
   *
   * @summary Update a subsidiary
   * @throws FetchError<400, types.UpdateSubsidiaryByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSubsidiaryByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSubsidiaryByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSubsidiaryByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSubsidiaryByIdResponse500> UnknownServerError
   */
  updateSubsidiaryById(body: types.UpdateSubsidiaryByIdBodyParam, metadata: types.UpdateSubsidiaryByIdMetadataParam): Promise<FetchResponse<200, types.UpdateSubsidiaryByIdResponse200>> {
    return this.core.fetch('/v1/subsidiaries/{subsidiaryId}', 'patch', body, metadata);
  }

  /**
   * Get a subsidiary by remote ID
   *
   * @summary Get a subsidiary by remote ID
   * @throws FetchError<400, types.GetSubsidiaryByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSubsidiaryByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSubsidiaryByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSubsidiaryByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSubsidiaryByRemoteIdResponse500> UnknownServerError
   */
  getSubsidiaryByRemoteId(metadata: types.GetSubsidiaryByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetSubsidiaryByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/subsidiaries/{remoteId}', 'get', metadata);
  }

  /**
   * Update an existing subsidiary by external system identifier
   *
   * @summary Update a subsidiary by remote ID
   * @throws FetchError<400, types.UpdateSubsidiaryByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSubsidiaryByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSubsidiaryByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSubsidiaryByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSubsidiaryByRemoteIdResponse500> UnknownServerError
   */
  updateSubsidiaryByRemoteId(body: types.UpdateSubsidiaryByRemoteIdBodyParam, metadata: types.UpdateSubsidiaryByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateSubsidiaryByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/subsidiaries/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new subsidiaries.
   *
   * @summary Create subsidiaries
   * @throws FetchError<400, types.CreateSubsidiariesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateSubsidiariesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateSubsidiariesResponse403> ForbiddenError
   * @throws FetchError<409, types.CreateSubsidiariesResponse409> ConflictError
   * @throws FetchError<500, types.CreateSubsidiariesResponse500> UnknownServerError
   */
  createSubsidiaries(body: types.CreateSubsidiariesBodyParam): Promise<FetchResponse<200, types.CreateSubsidiariesResponse200>> {
    return this.core.fetch('/v1/subsidiaries/batch', 'post', body);
  }

  /**
   * Get a paginated list of payment terms
   *
   * @summary List payment terms
   * @throws FetchError<400, types.GetPaymentTermsResponse400> BadRequestError
   * @throws FetchError<401, types.GetPaymentTermsResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPaymentTermsResponse403> ForbiddenError
   * @throws FetchError<500, types.GetPaymentTermsResponse500> UnknownServerError
   */
  getPaymentTerms(metadata?: types.GetPaymentTermsMetadataParam): Promise<FetchResponse<200, types.GetPaymentTermsResponse200>> {
    return this.core.fetch('/v1/payment-terms', 'get', metadata);
  }

  /**
   * Get a payment term by ID
   *
   * @summary Get a payment term by ID
   * @throws FetchError<400, types.GetPaymentTermByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPaymentTermByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPaymentTermByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPaymentTermByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPaymentTermByIdResponse500> UnknownServerError
   */
  getPaymentTermById(metadata: types.GetPaymentTermByIdMetadataParam): Promise<FetchResponse<200, types.GetPaymentTermByIdResponse200>> {
    return this.core.fetch('/v1/payment-terms/{paymentTermId}', 'get', metadata);
  }

  /**
   * Update an existing payment term
   *
   * @summary Update a payment term
   * @throws FetchError<400, types.UpdatePaymentTermByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePaymentTermByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePaymentTermByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePaymentTermByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePaymentTermByIdResponse500> UnknownServerError
   */
  updatePaymentTermById(body: types.UpdatePaymentTermByIdBodyParam, metadata: types.UpdatePaymentTermByIdMetadataParam): Promise<FetchResponse<200, types.UpdatePaymentTermByIdResponse200>> {
    return this.core.fetch('/v1/payment-terms/{paymentTermId}', 'patch', body, metadata);
  }

  /**
   * Get a payment term by remote ID
   *
   * @summary Get a payment term by remote ID
   * @throws FetchError<400, types.GetPaymentTermByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPaymentTermByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPaymentTermByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPaymentTermByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPaymentTermByRemoteIdResponse500> UnknownServerError
   */
  getPaymentTermByRemoteId(metadata: types.GetPaymentTermByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetPaymentTermByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/payment-terms/{remoteId}', 'get', metadata);
  }

  /**
   * Update a payment term by remote ID
   *
   * @summary Update a payment term by remote ID
   * @throws FetchError<400, types.UpdatePaymentTermByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePaymentTermByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePaymentTermByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePaymentTermByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePaymentTermByRemoteIdResponse500> UnknownServerError
   */
  updatePaymentTermByRemoteId(body: types.UpdatePaymentTermByRemoteIdBodyParam, metadata: types.UpdatePaymentTermByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdatePaymentTermByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/payment-terms/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new payment terms.
   *
   * @summary Create payment terms
   * @throws FetchError<400, types.CreatePaymentTermsResponse400> BadRequestError
   * @throws FetchError<401, types.CreatePaymentTermsResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreatePaymentTermsResponse403> ForbiddenError
   * @throws FetchError<409, types.CreatePaymentTermsResponse409> ConflictError
   * @throws FetchError<500, types.CreatePaymentTermsResponse500> UnknownServerError
   */
  createPaymentTerms(body: types.CreatePaymentTermsBodyParam): Promise<FetchResponse<200, types.CreatePaymentTermsResponse200>> {
    return this.core.fetch('/v1/payment-terms/batch', 'post', body);
  }

  /**
   * Retrieve a single custom data by slug
   *
   * @summary Get custom data by slug
   * @throws FetchError<400, types.GetCustomDataBySlugResponse400> BadRequestError
   * @throws FetchError<401, types.GetCustomDataBySlugResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCustomDataBySlugResponse403> ForbiddenError
   * @throws FetchError<404, types.GetCustomDataBySlugResponse404> NotFoundError
   * @throws FetchError<500, types.GetCustomDataBySlugResponse500> UnknownServerError
   */
  getCustomDataBySlug(metadata: types.GetCustomDataBySlugMetadataParam): Promise<FetchResponse<200, types.GetCustomDataBySlugResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}', 'get', metadata);
  }

  /**
   * Retrieve a single custom data record by ID
   *
   * @summary Get custom data by ID
   * @throws FetchError<400, types.GetCustomDataRecordByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetCustomDataRecordByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCustomDataRecordByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetCustomDataRecordByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetCustomDataRecordByIdResponse500> UnknownServerError
   */
  getCustomDataRecordById(metadata: types.GetCustomDataRecordByIdMetadataParam): Promise<FetchResponse<200, types.GetCustomDataRecordByIdResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records/{customDataRecordId}', 'get', metadata);
  }

  /**
   * Update a custom data record by ID
   *
   * @summary Update custom data record
   * @throws FetchError<400, types.UpdateCustomDataRecordByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateCustomDataRecordByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateCustomDataRecordByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateCustomDataRecordByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateCustomDataRecordByIdResponse500> UnknownServerError
   */
  updateCustomDataRecordById(body: types.UpdateCustomDataRecordByIdBodyParam, metadata: types.UpdateCustomDataRecordByIdMetadataParam): Promise<FetchResponse<200, types.UpdateCustomDataRecordByIdResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records/{customDataRecordId}', 'patch', body, metadata);
  }

  /**
   * Retrieve a single custom data record by remote ID
   *
   * @summary Get custom data record by remote ID
   * @throws FetchError<400, types.GetCustomDataRecordByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetCustomDataRecordByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCustomDataRecordByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetCustomDataRecordByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetCustomDataRecordByRemoteIdResponse500> UnknownServerError
   */
  getCustomDataRecordByRemoteId(metadata: types.GetCustomDataRecordByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetCustomDataRecordByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/custom-data/{customDataSlug}/records/{remoteId}', 'get', metadata);
  }

  /**
   * Update a custom data record by remote ID
   *
   * @summary Update custom data record by remote ID
   * @throws FetchError<400, types.UpdateCustomDataRecordByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateCustomDataRecordByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateCustomDataRecordByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateCustomDataRecordByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateCustomDataRecordByRemoteIdResponse500> UnknownServerError
   */
  updateCustomDataRecordByRemoteId(body: types.UpdateCustomDataRecordByRemoteIdBodyParam, metadata: types.UpdateCustomDataRecordByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateCustomDataRecordByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/custom-data/{customDataSlug}/records/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Get a paginated list of custom data records for a specific custom data slug
   *
   * @summary List custom data records
   * @throws FetchError<400, types.GetCustomDataRecordsResponse400> BadRequestError
   * @throws FetchError<401, types.GetCustomDataRecordsResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCustomDataRecordsResponse403> ForbiddenError
   * @throws FetchError<500, types.GetCustomDataRecordsResponse500> UnknownServerError
   */
  getCustomDataRecords(metadata: types.GetCustomDataRecordsMetadataParam): Promise<FetchResponse<200, types.GetCustomDataRecordsResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records', 'get', metadata);
  }

  /**
   * Create new custom data records for a specific custom data type.
   *
   * @summary Create custom data records
   * @throws FetchError<400, types.CreateCustomDataRecordsResponse400> BadRequestError
   * @throws FetchError<401, types.CreateCustomDataRecordsResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateCustomDataRecordsResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateCustomDataRecordsResponse404> NotFoundError
   * @throws FetchError<409, types.CreateCustomDataRecordsResponse409> ConflictError
   * @throws FetchError<500, types.CreateCustomDataRecordsResponse500> UnknownServerError
   */
  createCustomDataRecords(body: types.CreateCustomDataRecordsBodyParam, metadata: types.CreateCustomDataRecordsMetadataParam): Promise<FetchResponse<200, types.CreateCustomDataRecordsResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records/batch', 'post', body, metadata);
  }

  /**
   * Get a paginated list of custom data
   *
   * @summary List custom data
   * @throws FetchError<400, types.GetCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.GetCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCustomDataResponse403> ForbiddenError
   * @throws FetchError<500, types.GetCustomDataResponse500> UnknownServerError
   */
  getCustomData(metadata?: types.GetCustomDataMetadataParam): Promise<FetchResponse<200, types.GetCustomDataResponse200>> {
    return this.core.fetch('/v1/custom-data', 'get', metadata);
  }

  /**
   * Get a paginated list of departments
   *
   * @summary List departments
   * @throws FetchError<400, types.GetDepartmentsResponse400> BadRequestError
   * @throws FetchError<401, types.GetDepartmentsResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDepartmentsResponse403> ForbiddenError
   * @throws FetchError<500, types.GetDepartmentsResponse500> UnknownServerError
   */
  getDepartments(metadata?: types.GetDepartmentsMetadataParam): Promise<FetchResponse<200, types.GetDepartmentsResponse200>> {
    return this.core.fetch('/v1/departments', 'get', metadata);
  }

  /**
   * Get a department by ID
   *
   * @summary Get a department by ID
   * @throws FetchError<400, types.GetDepartmentByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetDepartmentByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDepartmentByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetDepartmentByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetDepartmentByIdResponse500> UnknownServerError
   */
  getDepartmentById(metadata: types.GetDepartmentByIdMetadataParam): Promise<FetchResponse<200, types.GetDepartmentByIdResponse200>> {
    return this.core.fetch('/v1/departments/{departmentId}', 'get', metadata);
  }

  /**
   * Update an existing department
   *
   * @summary Update a department
   * @throws FetchError<400, types.UpdateDepartmentByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateDepartmentByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateDepartmentByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateDepartmentByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateDepartmentByIdResponse500> UnknownServerError
   */
  updateDepartmentById(body: types.UpdateDepartmentByIdBodyParam, metadata: types.UpdateDepartmentByIdMetadataParam): Promise<FetchResponse<200, types.UpdateDepartmentByIdResponse200>> {
    return this.core.fetch('/v1/departments/{departmentId}', 'patch', body, metadata);
  }

  /**
   * Get a department by remote ID
   *
   * @summary Get a department by remote ID
   * @throws FetchError<400, types.GetDepartmentByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetDepartmentByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDepartmentByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetDepartmentByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetDepartmentByRemoteIdResponse500> UnknownServerError
   */
  getDepartmentByRemoteId(metadata: types.GetDepartmentByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetDepartmentByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/departments/{remoteId}', 'get', metadata);
  }

  /**
   * Update a department by remote ID
   *
   * @summary Update a department by remote ID
   * @throws FetchError<400, types.UpdateDepartmentByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateDepartmentByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateDepartmentByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateDepartmentByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateDepartmentByRemoteIdResponse500> UnknownServerError
   */
  updateDepartmentByRemoteId(body: types.UpdateDepartmentByRemoteIdBodyParam, metadata: types.UpdateDepartmentByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateDepartmentByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/departments/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new departments.
   *
   * @summary Create departments
   * @throws FetchError<400, types.CreateDepartmentsResponse400> BadRequestError
   * @throws FetchError<401, types.CreateDepartmentsResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateDepartmentsResponse403> ForbiddenError
   * @throws FetchError<409, types.CreateDepartmentsResponse409> ConflictError
   * @throws FetchError<500, types.CreateDepartmentsResponse500> UnknownServerError
   */
  createDepartments(body: types.CreateDepartmentsBodyParam): Promise<FetchResponse<200, types.CreateDepartmentsResponse200>> {
    return this.core.fetch('/v1/departments/batch', 'post', body);
  }

  /**
   * Get a paginated list of line item types
   *
   * @summary List line item types
   * @throws FetchError<400, types.GetLineItemTypesResponse400> BadRequestError
   * @throws FetchError<401, types.GetLineItemTypesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetLineItemTypesResponse403> ForbiddenError
   * @throws FetchError<500, types.GetLineItemTypesResponse500> UnknownServerError
   */
  getLineItemTypes(metadata?: types.GetLineItemTypesMetadataParam): Promise<FetchResponse<200, types.GetLineItemTypesResponse200>> {
    return this.core.fetch('/v1/line-item-types', 'get', metadata);
  }

  /**
   * Get a line item type by ID
   *
   * @summary Get a line item type by ID
   * @throws FetchError<400, types.GetLineItemTypeByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetLineItemTypeByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetLineItemTypeByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetLineItemTypeByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetLineItemTypeByIdResponse500> UnknownServerError
   */
  getLineItemTypeById(metadata: types.GetLineItemTypeByIdMetadataParam): Promise<FetchResponse<200, types.GetLineItemTypeByIdResponse200>> {
    return this.core.fetch('/v1/line-item-types/{lineItemTypeId}', 'get', metadata);
  }

  /**
   * Update an existing line item type
   *
   * @summary Update a line item type
   * @throws FetchError<400, types.UpdateLineItemTypeByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateLineItemTypeByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateLineItemTypeByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateLineItemTypeByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateLineItemTypeByIdResponse500> UnknownServerError
   */
  updateLineItemTypeById(body: types.UpdateLineItemTypeByIdBodyParam, metadata: types.UpdateLineItemTypeByIdMetadataParam): Promise<FetchResponse<200, types.UpdateLineItemTypeByIdResponse200>> {
    return this.core.fetch('/v1/line-item-types/{lineItemTypeId}', 'patch', body, metadata);
  }

  /**
   * Get a line item type by remote ID
   *
   * @summary Get a line item type by remote ID
   * @throws FetchError<400, types.GetLineItemTypeByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetLineItemTypeByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetLineItemTypeByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetLineItemTypeByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetLineItemTypeByRemoteIdResponse500> UnknownServerError
   */
  getLineItemTypeByRemoteId(metadata: types.GetLineItemTypeByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetLineItemTypeByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/line-item-types/{remoteId}', 'get', metadata);
  }

  /**
   * Update a line item type by remote ID
   *
   * @summary Update a line item type by remote ID
   * @throws FetchError<400, types.UpdateLineItemTypeByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateLineItemTypeByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateLineItemTypeByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateLineItemTypeByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateLineItemTypeByRemoteIdResponse500> UnknownServerError
   */
  updateLineItemTypeByRemoteId(body: types.UpdateLineItemTypeByRemoteIdBodyParam, metadata: types.UpdateLineItemTypeByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateLineItemTypeByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/line-item-types/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new line item types.
   *
   * @summary Create line item types
   * @throws FetchError<400, types.CreateLineItemTypesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateLineItemTypesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateLineItemTypesResponse403> ForbiddenError
   * @throws FetchError<409, types.CreateLineItemTypesResponse409> ConflictError
   * @throws FetchError<500, types.CreateLineItemTypesResponse500> UnknownServerError
   */
  createLineItemTypes(body: types.CreateLineItemTypesBodyParam): Promise<FetchResponse<200, types.CreateLineItemTypesResponse200>> {
    return this.core.fetch('/v1/line-item-types/batch', 'post', body);
  }

  /**
   * Get a paginated list of currencies
   *
   * @summary List currencies
   * @throws FetchError<400, types.GetCurrenciesResponse400> BadRequestError
   * @throws FetchError<401, types.GetCurrenciesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCurrenciesResponse403> ForbiddenError
   * @throws FetchError<500, types.GetCurrenciesResponse500> UnknownServerError
   */
  getCurrencies(metadata?: types.GetCurrenciesMetadataParam): Promise<FetchResponse<200, types.GetCurrenciesResponse200>> {
    return this.core.fetch('/v1/currencies', 'get', metadata);
  }

  /**
   * Get a currency by ID
   *
   * @summary Get a currency by ID
   * @throws FetchError<400, types.GetCurrencyByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetCurrencyByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCurrencyByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetCurrencyByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetCurrencyByIdResponse500> UnknownServerError
   */
  getCurrencyById(metadata: types.GetCurrencyByIdMetadataParam): Promise<FetchResponse<200, types.GetCurrencyByIdResponse200>> {
    return this.core.fetch('/v1/currencies/{currencyId}', 'get', metadata);
  }

  /**
   * Update an existing currency
   *
   * @summary Update a currency
   * @throws FetchError<400, types.UpdateCurrencyByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateCurrencyByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateCurrencyByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateCurrencyByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateCurrencyByIdResponse500> UnknownServerError
   */
  updateCurrencyById(body: types.UpdateCurrencyByIdBodyParam, metadata: types.UpdateCurrencyByIdMetadataParam): Promise<FetchResponse<200, types.UpdateCurrencyByIdResponse200>> {
    return this.core.fetch('/v1/currencies/{currencyId}', 'patch', body, metadata);
  }

  /**
   * Get a currency by remote ID
   *
   * @summary Get a currency by remote ID
   * @throws FetchError<400, types.GetCurrencyByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetCurrencyByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetCurrencyByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetCurrencyByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetCurrencyByRemoteIdResponse500> UnknownServerError
   */
  getCurrencyByRemoteId(metadata: types.GetCurrencyByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetCurrencyByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/currencies/{remoteId}', 'get', metadata);
  }

  /**
   * Update a currency by remote ID
   *
   * @summary Update a currency by remote ID
   * @throws FetchError<400, types.UpdateCurrencyByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateCurrencyByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateCurrencyByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateCurrencyByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateCurrencyByRemoteIdResponse500> UnknownServerError
   */
  updateCurrencyByRemoteId(body: types.UpdateCurrencyByRemoteIdBodyParam, metadata: types.UpdateCurrencyByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateCurrencyByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/currencies/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new currencies.
   *
   * @summary Create currencies
   * @throws FetchError<400, types.CreateCurrenciesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateCurrenciesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateCurrenciesResponse403> ForbiddenError
   * @throws FetchError<409, types.CreateCurrenciesResponse409> ConflictError
   * @throws FetchError<500, types.CreateCurrenciesResponse500> UnknownServerError
   */
  createCurrencies(body: types.CreateCurrenciesBodyParam): Promise<FetchResponse<200, types.CreateCurrenciesResponse200>> {
    return this.core.fetch('/v1/currencies/batch', 'post', body);
  }

  /**
   * Get a paginated list of payment methods
   *
   * @summary List payment methods
   * @throws FetchError<400, types.GetPaymentMethodsResponse400> BadRequestError
   * @throws FetchError<401, types.GetPaymentMethodsResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPaymentMethodsResponse403> ForbiddenError
   * @throws FetchError<500, types.GetPaymentMethodsResponse500> UnknownServerError
   */
  getPaymentMethods(metadata?: types.GetPaymentMethodsMetadataParam): Promise<FetchResponse<200, types.GetPaymentMethodsResponse200>> {
    return this.core.fetch('/v1/payment-methods', 'get', metadata);
  }

  /**
   * Get a payment method by ID
   *
   * @summary Get payment method
   * @throws FetchError<400, types.GetPaymentMethodByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPaymentMethodByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPaymentMethodByIdResponse403> ForbiddenError
   * @throws FetchError<500, types.GetPaymentMethodByIdResponse500> UnknownServerError
   */
  getPaymentMethodById(metadata: types.GetPaymentMethodByIdMetadataParam): Promise<FetchResponse<200, types.GetPaymentMethodByIdResponse200>> {
    return this.core.fetch('/v1/payment-methods/{paymentMethodId}', 'get', metadata);
  }

  /**
   * Update a payment method by ID
   *
   * @summary Update payment method
   * @throws FetchError<400, types.UpdatePaymentMethodResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePaymentMethodResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePaymentMethodResponse403> ForbiddenError
   * @throws FetchError<500, types.UpdatePaymentMethodResponse500> UnknownServerError
   */
  updatePaymentMethod(body: types.UpdatePaymentMethodBodyParam, metadata: types.UpdatePaymentMethodMetadataParam): Promise<FetchResponse<200, types.UpdatePaymentMethodResponse200>> {
    return this.core.fetch('/v1/payment-methods/{paymentMethodId}', 'patch', body, metadata);
  }

  /**
   * Get a payment method by remote ID
   *
   * @summary Get a payment method by remote ID
   * @throws FetchError<400, types.GetPaymentMethodByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPaymentMethodByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPaymentMethodByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPaymentMethodByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPaymentMethodByRemoteIdResponse500> UnknownServerError
   */
  getPaymentMethodByRemoteId(metadata: types.GetPaymentMethodByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetPaymentMethodByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/payment-methods/{remoteId}', 'get', metadata);
  }

  /**
   * Update a payment method by remote ID
   *
   * @summary Update a payment method by remote ID
   * @throws FetchError<400, types.UpdatePaymentMethodByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePaymentMethodByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePaymentMethodByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePaymentMethodByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePaymentMethodByRemoteIdResponse500> UnknownServerError
   */
  updatePaymentMethodByRemoteId(body: types.UpdatePaymentMethodByRemoteIdBodyParam, metadata: types.UpdatePaymentMethodByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdatePaymentMethodByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/payment-methods/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new payment methods.
   *
   * @summary Create payment methods
   * @throws FetchError<400, types.CreatePaymentMethodsResponse400> BadRequestError
   * @throws FetchError<401, types.CreatePaymentMethodsResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreatePaymentMethodsResponse403> ForbiddenError
   * @throws FetchError<409, types.CreatePaymentMethodsResponse409> ConflictError
   * @throws FetchError<500, types.CreatePaymentMethodsResponse500> UnknownServerError
   */
  createPaymentMethods(body: types.CreatePaymentMethodsBodyParam): Promise<FetchResponse<200, types.CreatePaymentMethodsResponse200>> {
    return this.core.fetch('/v1/payment-methods/batch', 'post', body);
  }

  /**
   * Get a paginated list of dependencies
   *
   * @summary List dependencies
   * @throws FetchError<400, types.GetDependenciesResponse400> BadRequestError
   * @throws FetchError<401, types.GetDependenciesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDependenciesResponse403> ForbiddenError
   * @throws FetchError<500, types.GetDependenciesResponse500> UnknownServerError
   */
  getDependencies(metadata: types.GetDependenciesMetadataParam): Promise<FetchResponse<200, types.GetDependenciesResponse200>> {
    return this.core.fetch('/v1/{resourceType}/{resourceId}/dependencies', 'get', metadata);
  }

  /**
   * Get a paginated list of dependencies by remote ID
   *
   * @summary List dependencies by remote ID
   * @throws FetchError<400, types.GetDependenciesByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetDependenciesByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDependenciesByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<500, types.GetDependenciesByRemoteIdResponse500> UnknownServerError
   */
  getDependenciesByRemoteId(metadata: types.GetDependenciesByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetDependenciesByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/{resourceType}/{resourceRemoteId}/dependencies', 'get', metadata);
  }

  /**
   * Add dependencies to parent resource
   *
   * @summary Add dependencies
   * @throws FetchError<400, types.CreateDependenciesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateDependenciesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateDependenciesResponse403> ForbiddenError
   * @throws FetchError<500, types.CreateDependenciesResponse500> UnknownServerError
   */
  createDependencies(body: types.CreateDependenciesBodyParam, metadata: types.CreateDependenciesMetadataParam): Promise<FetchResponse<200, types.CreateDependenciesResponse200>> {
    return this.core.fetch('/v1/{resourceType}/{resourceId}/dependencies/batch', 'post', body, metadata);
  }

  /**
   * Add dependencies by remote ID
   *
   * @summary Add dependencies
   * @throws FetchError<400, types.CreateDependenciesByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreateDependenciesByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateDependenciesByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<500, types.CreateDependenciesByRemoteIdResponse500> UnknownServerError
   */
  createDependenciesByRemoteId(body: types.CreateDependenciesByRemoteIdBodyParam, metadata: types.CreateDependenciesByRemoteIdMetadataParam): Promise<FetchResponse<200, types.CreateDependenciesByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/{resourceType}/{resourceRemoteId}/dependencies/batch', 'post', body, metadata);
  }

  /**
   * Delete a specific dependency relationship
   *
   * @summary Delete dependency
   * @throws FetchError<400, types.DeleteDependencyResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteDependencyResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteDependencyResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteDependencyResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteDependencyResponse500> UnknownServerError
   */
  deleteDependency(metadata: types.DeleteDependencyMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/{resourceType}/{resourceId}/dependencies/{dependencyId}', 'delete', metadata);
  }

  /**
   * Delete a specific dependency relationship by remote ID
   *
   * @summary Delete dependency by remote ID
   * @throws FetchError<400, types.DeleteDependencyByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteDependencyByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteDependencyByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteDependencyByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteDependencyByRemoteIdResponse500> UnknownServerError
   */
  deleteDependencyByRemoteId(metadata: types.DeleteDependencyByRemoteIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/{resourceType}/{resourceRemoteId}/dependencies/{dependencyRemoteId}', 'delete', metadata);
  }

  /**
   * Get a paginated list of dependencies for custom data
   *
   * @summary List custom data dependencies
   * @throws FetchError<400, types.GetDependenciesForCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.GetDependenciesForCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDependenciesForCustomDataResponse403> ForbiddenError
   * @throws FetchError<500, types.GetDependenciesForCustomDataResponse500> UnknownServerError
   */
  getDependenciesForCustomData(metadata: types.GetDependenciesForCustomDataMetadataParam): Promise<FetchResponse<200, types.GetDependenciesForCustomDataResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records/{customDataRecordId}/dependencies', 'get', metadata);
  }

  /**
   * Get a paginated list of dependencies for custom data by remote ID
   *
   * @summary List custom data record dependencies by remote ID
   * @throws FetchError<400, types.GetDependenciesByRemoteIdForCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.GetDependenciesByRemoteIdForCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetDependenciesByRemoteIdForCustomDataResponse403> ForbiddenError
   * @throws FetchError<500, types.GetDependenciesByRemoteIdForCustomDataResponse500> UnknownServerError
   */
  getDependenciesByRemoteIdForCustomData(metadata: types.GetDependenciesByRemoteIdForCustomDataMetadataParam): Promise<FetchResponse<200, types.GetDependenciesByRemoteIdForCustomDataResponse200>> {
    return this.core.fetch('/v1/by-remote-id/custom-data/{customDataSlug}/records/{remoteId}/dependencies', 'get', metadata);
  }

  /**
   * Add dependencies to custom data record
   *
   * @summary Add dependencies to custom data record
   * @throws FetchError<400, types.CreateDependenciesForCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.CreateDependenciesForCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateDependenciesForCustomDataResponse403> ForbiddenError
   * @throws FetchError<500, types.CreateDependenciesForCustomDataResponse500> UnknownServerError
   */
  createDependenciesForCustomData(body: types.CreateDependenciesForCustomDataBodyParam, metadata: types.CreateDependenciesForCustomDataMetadataParam): Promise<FetchResponse<200, types.CreateDependenciesForCustomDataResponse200>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records/{customDataRecordId}/dependencies/batch', 'post', body, metadata);
  }

  /**
   * Add dependencies to custom data record by remote ID
   *
   * @summary Add dependencies to custom data record by remote ID
   * @throws FetchError<400, types.CreateDependenciesByRemoteIdForCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.CreateDependenciesByRemoteIdForCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateDependenciesByRemoteIdForCustomDataResponse403> ForbiddenError
   * @throws FetchError<500, types.CreateDependenciesByRemoteIdForCustomDataResponse500> UnknownServerError
   */
  createDependenciesByRemoteIdForCustomData(body: types.CreateDependenciesByRemoteIdForCustomDataBodyParam, metadata: types.CreateDependenciesByRemoteIdForCustomDataMetadataParam): Promise<FetchResponse<200, types.CreateDependenciesByRemoteIdForCustomDataResponse200>> {
    return this.core.fetch('/v1/by-remote-id/custom-data/{customDataSlug}/records/{remoteId}/dependencies/batch', 'post', body, metadata);
  }

  /**
   * Delete a specific dependency relationship from custom data record
   *
   * @summary Delete dependency from custom data record
   * @throws FetchError<400, types.DeleteDependencyForCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteDependencyForCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteDependencyForCustomDataResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteDependencyForCustomDataResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteDependencyForCustomDataResponse500> UnknownServerError
   */
  deleteDependencyForCustomData(metadata: types.DeleteDependencyForCustomDataMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/custom-data/{customDataSlug}/records/{customDataRecordId}/dependencies/{dependencyId}', 'delete', metadata);
  }

  /**
   * Delete a specific dependency relationship from custom data record by remote ID
   *
   * @summary Delete dependency from custom data record by remote ID
   * @throws FetchError<400, types.DeleteDependencyByRemoteIdForCustomDataResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteDependencyByRemoteIdForCustomDataResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteDependencyByRemoteIdForCustomDataResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteDependencyByRemoteIdForCustomDataResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteDependencyByRemoteIdForCustomDataResponse500> UnknownServerError
   */
  deleteDependencyByRemoteIdForCustomData(metadata: types.DeleteDependencyByRemoteIdForCustomDataMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/custom-data/{customDataSlug}/records/{remoteId}/dependencies/{dependencyRemoteId}', 'delete', metadata);
  }

  /**
   * Get a paginated list of addresses
   *
   * @summary List addresses
   * @throws FetchError<400, types.GetAddressesResponse400> BadRequestError
   * @throws FetchError<401, types.GetAddressesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetAddressesResponse403> ForbiddenError
   * @throws FetchError<500, types.GetAddressesResponse500> UnknownServerError
   */
  getAddresses(metadata?: types.GetAddressesMetadataParam): Promise<FetchResponse<200, types.GetAddressesResponse200>> {
    return this.core.fetch('/v1/addresses', 'get', metadata);
  }

  /**
   * Get an address by ID
   *
   * @summary Get an address by ID
   * @throws FetchError<400, types.GetAddressByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetAddressByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetAddressByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetAddressByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetAddressByIdResponse500> UnknownServerError
   */
  getAddressById(metadata: types.GetAddressByIdMetadataParam): Promise<FetchResponse<200, types.GetAddressByIdResponse200>> {
    return this.core.fetch('/v1/addresses/{addressId}', 'get', metadata);
  }

  /**
   * Update an existing address
   *
   * @summary Update an address
   * @throws FetchError<400, types.UpdateAddressResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateAddressResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateAddressResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateAddressResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateAddressResponse500> UnknownServerError
   */
  updateAddress(body: types.UpdateAddressBodyParam, metadata: types.UpdateAddressMetadataParam): Promise<FetchResponse<200, types.UpdateAddressResponse200>> {
    return this.core.fetch('/v1/addresses/{addressId}', 'patch', body, metadata);
  }

  /**
   * Get an address by remote ID
   *
   * @summary Get an address by remote ID
   * @throws FetchError<400, types.GetAddressByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetAddressByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetAddressByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetAddressByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetAddressByRemoteIdResponse500> UnknownServerError
   */
  getAddressByRemoteId(metadata: types.GetAddressByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetAddressByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/addresses/{remoteId}', 'get', metadata);
  }

  /**
   * Update an existing address by remote ID
   *
   * @summary Update an address by remote ID
   * @throws FetchError<400, types.UpdateAddressByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateAddressByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateAddressByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateAddressByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateAddressByRemoteIdResponse500> UnknownServerError
   */
  updateAddressByRemoteId(body: types.UpdateAddressByRemoteIdBodyParam, metadata: types.UpdateAddressByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateAddressByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/addresses/{remoteId}', 'patch', body, metadata);
  }

  /**
   * Create new addresses.
   *
   * @summary Create addresses
   * @throws FetchError<400, types.CreateAddressesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateAddressesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateAddressesResponse403> ForbiddenError
   * @throws FetchError<409, types.CreateAddressesResponse409> ConflictError
   * @throws FetchError<500, types.CreateAddressesResponse500> UnknownServerError
   */
  createAddresses(body: types.CreateAddressesBodyParam): Promise<FetchResponse<200, types.CreateAddressesResponse200>> {
    return this.core.fetch('/v1/addresses/batch', 'post', body);
  }

  /**
   * List suppliers with pagination support
   *
   * @summary Get suppliers
   * @throws FetchError<400, types.GetSuppliersResponse400> BadRequestError
   * @throws FetchError<401, types.GetSuppliersResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSuppliersResponse403> ForbiddenError
   * @throws FetchError<500, types.GetSuppliersResponse500> UnknownServerError
   */
  getSuppliers(metadata?: types.GetSuppliersMetadataParam): Promise<FetchResponse<200, types.GetSuppliersResponse200>> {
    return this.core.fetch('/v1/suppliers', 'get', metadata);
  }

  /**
   * Create multiple suppliers in batch
   *
   * @summary Create suppliers in batch
   * @throws FetchError<400, types.CreateSuppliersResponse400> BadRequestError
   * @throws FetchError<401, types.CreateSuppliersResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateSuppliersResponse403> ForbiddenError
   * @throws FetchError<500, types.CreateSuppliersResponse500> UnknownServerError
   */
  createSuppliers(body: types.CreateSuppliersBodyParam): Promise<FetchResponse<200, types.CreateSuppliersResponse200>> {
    return this.core.fetch('/v1/suppliers/batch', 'post', body);
  }

  /**
   * Update multiple suppliers in batch
   *
   * @summary Batch update suppliers
   * @throws FetchError<400, types.UpdateSuppliersResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSuppliersResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSuppliersResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSuppliersResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSuppliersResponse500> UnknownServerError
   */
  updateSuppliers(body: types.UpdateSuppliersBodyParam): Promise<FetchResponse<200, types.UpdateSuppliersResponse200>> {
    return this.core.fetch('/v1/suppliers/batch', 'patch', body);
  }

  /**
   * Retrieve detailed supplier information by ID
   *
   * @summary Get supplier by ID
   * @throws FetchError<400, types.GetSupplierByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierByIdResponse500> UnknownServerError
   */
  getSupplierById(metadata: types.GetSupplierByIdMetadataParam): Promise<FetchResponse<200, types.GetSupplierByIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}', 'get', metadata);
  }

  /**
   * Update supplier information (partial update)
   *
   * @summary Update supplier
   * @throws FetchError<400, types.UpdateSupplierResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSupplierResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSupplierResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSupplierResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSupplierResponse500> UnknownServerError
   */
  updateSupplier(body: types.UpdateSupplierBodyParam, metadata: types.UpdateSupplierMetadataParam): Promise<FetchResponse<200, types.UpdateSupplierResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}', 'patch', body, metadata);
  }

  /**
   * Retrieve detailed supplier information by remote ID
   *
   * @summary Get supplier by remote ID
   * @throws FetchError<400, types.GetSupplierByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierByRemoteIdResponse500> UnknownServerError
   */
  getSupplierByRemoteId(metadata: types.GetSupplierByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetSupplierByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}', 'get', metadata);
  }

  /**
   * Update supplier information by remote ID
   *
   * @summary Update supplier by remote ID
   * @throws FetchError<400, types.UpdateSupplierByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSupplierByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSupplierByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSupplierByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSupplierByRemoteIdResponse500> UnknownServerError
   */
  updateSupplierByRemoteId(body: types.UpdateSupplierByRemoteIdBodyParam, metadata: types.UpdateSupplierByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateSupplierByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}', 'patch', body, metadata);
  }

  /**
   * Update multiple suppliers by remote ID in batch
   *
   * @summary Batch update suppliers by remote ID
   * @throws FetchError<400, types.UpdateSuppliersByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSuppliersByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSuppliersByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSuppliersByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSuppliersByRemoteIdResponse500> UnknownServerError
   */
  updateSuppliersByRemoteId(body: types.UpdateSuppliersByRemoteIdBodyParam): Promise<FetchResponse<200, types.UpdateSuppliersByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/batch', 'patch', body);
  }

  /**
   * Get a paginated list of external contacts for a supplier
   *
   * @summary List external contacts
   * @throws FetchError<400, types.GetExternalContactsResponse400> BadRequestError
   * @throws FetchError<401, types.GetExternalContactsResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetExternalContactsResponse403> ForbiddenError
   * @throws FetchError<404, types.GetExternalContactsResponse404> NotFoundError
   * @throws FetchError<500, types.GetExternalContactsResponse500> UnknownServerError
   */
  getExternalContacts(metadata: types.GetExternalContactsMetadataParam): Promise<FetchResponse<200, types.GetExternalContactsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/external-contacts', 'get', metadata);
  }

  /**
   * List external contacts for a supplier by remote ID
   *
   * @summary List external contacts by supplier remote ID
   * @throws FetchError<400, types.GetExternalContactsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetExternalContactsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetExternalContactsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetExternalContactsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetExternalContactsByRemoteIdResponse500> UnknownServerError
   */
  getExternalContactsByRemoteId(metadata: types.GetExternalContactsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetExternalContactsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/external-contacts', 'get', metadata);
  }

  /**
   * Retrieve detailed external contact information by ID
   *
   * @summary Get external contact by ID
   * @throws FetchError<400, types.GetExternalContactByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetExternalContactByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetExternalContactByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetExternalContactByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetExternalContactByIdResponse500> UnknownServerError
   */
  getExternalContactById(metadata: types.GetExternalContactByIdMetadataParam): Promise<FetchResponse<200, types.GetExternalContactByIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/external-contacts/{contactId}', 'get', metadata);
  }

  /**
   * Update an existing external contact
   *
   * @summary Update external contact
   * @throws FetchError<400, types.UpdateExternalContactByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateExternalContactByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateExternalContactByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateExternalContactByIdResponse404> NotFoundError
   * @throws FetchError<409, types.UpdateExternalContactByIdResponse409> ConflictError
   * @throws FetchError<500, types.UpdateExternalContactByIdResponse500> UnknownServerError
   */
  updateExternalContactById(body: types.UpdateExternalContactByIdBodyParam, metadata: types.UpdateExternalContactByIdMetadataParam): Promise<FetchResponse<200, types.UpdateExternalContactByIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/external-contacts/{contactId}', 'patch', body, metadata);
  }

  /**
   * Delete an external contact (soft delete)
   *
   * @summary Delete external contact
   * @throws FetchError<400, types.DeleteExternalContactByIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteExternalContactByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteExternalContactByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteExternalContactByIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteExternalContactByIdResponse500> UnknownServerError
   */
  deleteExternalContactById(metadata: types.DeleteExternalContactByIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/external-contacts/{contactId}', 'delete', metadata);
  }

  /**
   * Retrieve an external contact by supplier remote ID
   *
   * @summary Get external contact by supplier remote ID
   * @throws FetchError<400, types.GetExternalContactByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetExternalContactByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetExternalContactByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetExternalContactByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetExternalContactByRemoteIdResponse500> UnknownServerError
   */
  getExternalContactByRemoteId(metadata: types.GetExternalContactByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetExternalContactByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/external-contacts/{contactId}', 'get', metadata);
  }

  /**
   * Update an existing external contact by supplier remote ID
   *
   * @summary Update external contact by supplier remote ID
   * @throws FetchError<400, types.UpdateExternalContactByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateExternalContactByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateExternalContactByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateExternalContactByRemoteIdResponse404> NotFoundError
   * @throws FetchError<409, types.UpdateExternalContactByRemoteIdResponse409> ConflictError
   * @throws FetchError<500, types.UpdateExternalContactByRemoteIdResponse500> UnknownServerError
   */
  updateExternalContactByRemoteId(body: types.UpdateExternalContactByRemoteIdBodyParam, metadata: types.UpdateExternalContactByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateExternalContactByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/external-contacts/{contactId}', 'patch', body, metadata);
  }

  /**
   * Delete an external contact by supplier remote ID
   *
   * @summary Delete external contact by supplier remote ID
   * @throws FetchError<400, types.DeleteExternalContactByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteExternalContactByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteExternalContactByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteExternalContactByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteExternalContactByRemoteIdResponse500> UnknownServerError
   */
  deleteExternalContactByRemoteId(metadata: types.DeleteExternalContactByRemoteIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/external-contacts/{contactId}', 'delete', metadata);
  }

  /**
   * Create new external contacts for a supplier.
   *
   * @summary Create external contacts
   * @throws FetchError<400, types.CreateExternalContactsResponse400> BadRequestError
   * @throws FetchError<401, types.CreateExternalContactsResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateExternalContactsResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateExternalContactsResponse404> NotFoundError
   * @throws FetchError<409, types.CreateExternalContactsResponse409> ConflictError
   * @throws FetchError<500, types.CreateExternalContactsResponse500> UnknownServerError
   */
  createExternalContacts(body: types.CreateExternalContactsBodyParam, metadata: types.CreateExternalContactsMetadataParam): Promise<FetchResponse<200, types.CreateExternalContactsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/external-contacts/batch', 'post', body, metadata);
  }

  /**
   * Create external contacts for a supplier by supplier remote ID
   *
   * @summary Create external contacts by supplier remote ID
   * @throws FetchError<400, types.CreateExternalContactsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreateExternalContactsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateExternalContactsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateExternalContactsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<409, types.CreateExternalContactsByRemoteIdResponse409> ConflictError
   * @throws FetchError<500, types.CreateExternalContactsByRemoteIdResponse500> UnknownServerError
   */
  createExternalContactsByRemoteId(body: types.CreateExternalContactsByRemoteIdBodyParam, metadata: types.CreateExternalContactsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.CreateExternalContactsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/external-contacts/batch', 'post', body, metadata);
  }

  /**
   * Get a paginated list of internal contacts for a supplier
   *
   * @summary List internal contacts
   * @throws FetchError<400, types.GetInternalContactsResponse400> BadRequestError
   * @throws FetchError<401, types.GetInternalContactsResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetInternalContactsResponse403> ForbiddenError
   * @throws FetchError<404, types.GetInternalContactsResponse404> NotFoundError
   * @throws FetchError<500, types.GetInternalContactsResponse500> UnknownServerError
   */
  getInternalContacts(metadata: types.GetInternalContactsMetadataParam): Promise<FetchResponse<200, types.GetInternalContactsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/internal-contacts', 'get', metadata);
  }

  /**
   * List internal contacts for a supplier by remote ID
   *
   * @summary List internal contacts by supplier remote ID
   * @throws FetchError<400, types.GetInternalContactsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetInternalContactsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetInternalContactsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetInternalContactsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetInternalContactsByRemoteIdResponse500> UnknownServerError
   */
  getInternalContactsByRemoteId(metadata: types.GetInternalContactsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetInternalContactsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/internal-contacts', 'get', metadata);
  }

  /**
   * Retrieve detailed internal contact information by ID
   *
   * @summary Get internal contact by ID
   * @throws FetchError<400, types.GetInternalContactByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetInternalContactByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetInternalContactByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetInternalContactByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetInternalContactByIdResponse500> UnknownServerError
   */
  getInternalContactById(metadata: types.GetInternalContactByIdMetadataParam): Promise<FetchResponse<200, types.GetInternalContactByIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/internal-contacts/{contactId}', 'get', metadata);
  }

  /**
   * Update an existing internal contact
   *
   * @summary Update internal contact
   * @throws FetchError<400, types.UpdateInternalContactByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateInternalContactByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateInternalContactByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateInternalContactByIdResponse404> NotFoundError
   * @throws FetchError<409, types.UpdateInternalContactByIdResponse409> ConflictError
   * @throws FetchError<500, types.UpdateInternalContactByIdResponse500> UnknownServerError
   */
  updateInternalContactById(body: types.UpdateInternalContactByIdBodyParam, metadata: types.UpdateInternalContactByIdMetadataParam): Promise<FetchResponse<200, types.UpdateInternalContactByIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/internal-contacts/{contactId}', 'patch', body, metadata);
  }

  /**
   * Delete an internal contact (soft delete)
   *
   * @summary Delete internal contact
   * @throws FetchError<400, types.DeleteInternalContactByIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteInternalContactByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteInternalContactByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteInternalContactByIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteInternalContactByIdResponse500> UnknownServerError
   */
  deleteInternalContactById(metadata: types.DeleteInternalContactByIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/internal-contacts/{contactId}', 'delete', metadata);
  }

  /**
   * Retrieve an internal contact by supplier remote ID
   *
   * @summary Get internal contact by supplier remote ID
   * @throws FetchError<400, types.GetInternalContactByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetInternalContactByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetInternalContactByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetInternalContactByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetInternalContactByRemoteIdResponse500> UnknownServerError
   */
  getInternalContactByRemoteId(metadata: types.GetInternalContactByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetInternalContactByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/internal-contacts/{contactId}', 'get', metadata);
  }

  /**
   * Update an existing internal contact by supplier remote ID
   *
   * @summary Update internal contact by supplier remote ID
   * @throws FetchError<400, types.UpdateInternalContactByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateInternalContactByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateInternalContactByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateInternalContactByRemoteIdResponse404> NotFoundError
   * @throws FetchError<409, types.UpdateInternalContactByRemoteIdResponse409> ConflictError
   * @throws FetchError<500, types.UpdateInternalContactByRemoteIdResponse500> UnknownServerError
   */
  updateInternalContactByRemoteId(body: types.UpdateInternalContactByRemoteIdBodyParam, metadata: types.UpdateInternalContactByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateInternalContactByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/internal-contacts/{contactId}', 'patch', body, metadata);
  }

  /**
   * Delete an internal contact by supplier remote ID
   *
   * @summary Delete internal contact by supplier remote ID
   * @throws FetchError<400, types.DeleteInternalContactByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteInternalContactByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteInternalContactByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteInternalContactByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteInternalContactByRemoteIdResponse500> UnknownServerError
   */
  deleteInternalContactByRemoteId(metadata: types.DeleteInternalContactByRemoteIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/internal-contacts/{contactId}', 'delete', metadata);
  }

  /**
   * Create new internal contacts for a supplier.
   *
   * @summary Create internal contacts
   * @throws FetchError<400, types.CreateInternalContactsResponse400> BadRequestError
   * @throws FetchError<401, types.CreateInternalContactsResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateInternalContactsResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateInternalContactsResponse404> NotFoundError
   * @throws FetchError<409, types.CreateInternalContactsResponse409> ConflictError
   * @throws FetchError<500, types.CreateInternalContactsResponse500> UnknownServerError
   */
  createInternalContacts(body: types.CreateInternalContactsBodyParam, metadata: types.CreateInternalContactsMetadataParam): Promise<FetchResponse<200, types.CreateInternalContactsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/internal-contacts/batch', 'post', body, metadata);
  }

  /**
   * Create internal contacts for a supplier by supplier remote ID
   *
   * @summary Create internal contacts by supplier remote ID
   * @throws FetchError<400, types.CreateInternalContactsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreateInternalContactsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateInternalContactsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateInternalContactsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<409, types.CreateInternalContactsByRemoteIdResponse409> ConflictError
   * @throws FetchError<500, types.CreateInternalContactsByRemoteIdResponse500> UnknownServerError
   */
  createInternalContactsByRemoteId(body: types.CreateInternalContactsByRemoteIdBodyParam, metadata: types.CreateInternalContactsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.CreateInternalContactsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/internal-contacts/batch', 'post', body, metadata);
  }

  /**
   * Get a paginated list of subsidiaries for a supplier
   *
   * @summary List supplier subsidiaries
   * @throws FetchError<400, types.GetSupplierSubsidiariesResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierSubsidiariesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierSubsidiariesResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierSubsidiariesResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierSubsidiariesResponse500> UnknownServerError
   */
  getSupplierSubsidiaries(metadata: types.GetSupplierSubsidiariesMetadataParam): Promise<FetchResponse<200, types.GetSupplierSubsidiariesResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/subsidiaries', 'get', metadata);
  }

  /**
   * Create subsidiary associations for a supplier in batch
   *
   * @summary Batch create supplier subsidiaries
   * @throws FetchError<400, types.CreateSupplierSubsidiariesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateSupplierSubsidiariesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateSupplierSubsidiariesResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateSupplierSubsidiariesResponse404> NotFoundError
   * @throws FetchError<500, types.CreateSupplierSubsidiariesResponse500> UnknownServerError
   */
  createSupplierSubsidiaries(body: types.CreateSupplierSubsidiariesBodyParam, metadata: types.CreateSupplierSubsidiariesMetadataParam): Promise<FetchResponse<200, types.CreateSupplierSubsidiariesResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/subsidiaries/batch', 'post', body, metadata);
  }

  /**
   * Delete a subsidiary association from a supplier
   *
   * @summary Delete supplier subsidiary
   * @throws FetchError<400, types.DeleteSupplierSubsidiaryResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteSupplierSubsidiaryResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteSupplierSubsidiaryResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteSupplierSubsidiaryResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteSupplierSubsidiaryResponse500> UnknownServerError
   */
  deleteSupplierSubsidiary(metadata: types.DeleteSupplierSubsidiaryMetadataParam): Promise<FetchResponse<200, types.DeleteSupplierSubsidiaryResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/subsidiaries/{subsidiaryId}', 'delete', metadata);
  }

  /**
   * Get a paginated list of subsidiaries for a supplier by remote ID
   *
   * @summary List supplier subsidiaries by supplier remote ID
   * @throws FetchError<400, types.GetSupplierSubsidiariesByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierSubsidiariesByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierSubsidiariesByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierSubsidiariesByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierSubsidiariesByRemoteIdResponse500> UnknownServerError
   */
  getSupplierSubsidiariesByRemoteId(metadata: types.GetSupplierSubsidiariesByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetSupplierSubsidiariesByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/subsidiaries', 'get', metadata);
  }

  /**
   * Create subsidiary associations for a supplier by supplier remote ID
   *
   * @summary Create supplier subsidiaries by supplier remote ID
   * @throws FetchError<400, types.CreateSupplierSubsidiariesByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreateSupplierSubsidiariesByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateSupplierSubsidiariesByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateSupplierSubsidiariesByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.CreateSupplierSubsidiariesByRemoteIdResponse500> UnknownServerError
   */
  createSupplierSubsidiariesByRemoteId(body: types.CreateSupplierSubsidiariesByRemoteIdBodyParam, metadata: types.CreateSupplierSubsidiariesByRemoteIdMetadataParam): Promise<FetchResponse<200, types.CreateSupplierSubsidiariesByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/subsidiaries/batch', 'post', body, metadata);
  }

  /**
   * Delete a subsidiary association from a supplier by supplier remote ID
   *
   * @summary Delete supplier subsidiary by supplier remote ID
   * @throws FetchError<400, types.DeleteSupplierSubsidiaryByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeleteSupplierSubsidiaryByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeleteSupplierSubsidiaryByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeleteSupplierSubsidiaryByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeleteSupplierSubsidiaryByRemoteIdResponse500> UnknownServerError
   */
  deleteSupplierSubsidiaryByRemoteId(metadata: types.DeleteSupplierSubsidiaryByRemoteIdMetadataParam): Promise<FetchResponse<200, types.DeleteSupplierSubsidiaryByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/subsidiaries/{subsidiaryRemoteId}', 'delete', metadata);
  }

  /**
   * Create supplier profiles for a given supplier in batch
   *
   * @summary Batch create supplier profiles
   * @throws FetchError<400, types.CreateSupplierProfilesResponse400> BadRequestError
   * @throws FetchError<401, types.CreateSupplierProfilesResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateSupplierProfilesResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateSupplierProfilesResponse404> NotFoundError
   * @throws FetchError<409, types.CreateSupplierProfilesResponse409> ConflictError
   * @throws FetchError<500, types.CreateSupplierProfilesResponse500> UnknownServerError
   */
  createSupplierProfiles(body: types.CreateSupplierProfilesBodyParam, metadata: types.CreateSupplierProfilesMetadataParam): Promise<FetchResponse<200, types.CreateSupplierProfilesResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles/batch', 'post', body, metadata);
  }

  /**
   * Create supplier profiles for a given supplier by remote ID in batch
   *
   * @summary Batch create supplier profiles by remote ID
   * @throws FetchError<400, types.CreateSupplierProfilesByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreateSupplierProfilesByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreateSupplierProfilesByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.CreateSupplierProfilesByRemoteIdResponse404> NotFoundError
   * @throws FetchError<409, types.CreateSupplierProfilesByRemoteIdResponse409> ConflictError
   * @throws FetchError<500, types.CreateSupplierProfilesByRemoteIdResponse500> UnknownServerError
   */
  createSupplierProfilesByRemoteId(body: types.CreateSupplierProfilesByRemoteIdBodyParam, metadata: types.CreateSupplierProfilesByRemoteIdMetadataParam): Promise<FetchResponse<200, types.CreateSupplierProfilesByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles/batch', 'post', body, metadata);
  }

  /**
   * Get a paginated list of supplier profiles
   *
   * @summary Get supplier profiles
   * @throws FetchError<400, types.GetSupplierProfilesResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierProfilesResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierProfilesResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierProfilesResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierProfilesResponse500> UnknownServerError
   */
  getSupplierProfiles(metadata: types.GetSupplierProfilesMetadataParam): Promise<FetchResponse<200, types.GetSupplierProfilesResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles', 'get', metadata);
  }

  /**
   * Get a paginated list of supplier profiles by supplier remote ID
   *
   * @summary Get supplier profiles by remote ID
   * @throws FetchError<400, types.GetSupplierProfilesByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierProfilesByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierProfilesByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierProfilesByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierProfilesByRemoteIdResponse500> UnknownServerError
   */
  getSupplierProfilesByRemoteId(metadata: types.GetSupplierProfilesByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetSupplierProfilesByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles', 'get', metadata);
  }

  /**
   * Get detailed supplier profile data by subsidiary ID
   *
   * @summary Get supplier profile by subsidiary ID
   * @throws FetchError<400, types.GetSupplierProfileBySubsidiaryIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierProfileBySubsidiaryIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierProfileBySubsidiaryIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierProfileBySubsidiaryIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierProfileBySubsidiaryIdResponse500> UnknownServerError
   */
  getSupplierProfileBySubsidiaryId(metadata: types.GetSupplierProfileBySubsidiaryIdMetadataParam): Promise<FetchResponse<200, types.GetSupplierProfileBySubsidiaryIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles/{subsidiaryId}', 'get', metadata);
  }

  /**
   * Update an existing supplier profile for a specific subsidiary. Supports partial updates
   * - only provided fields will be updated.
   *
   * @summary Update supplier profile by subsidiary ID
   * @throws FetchError<400, types.UpdateSupplierProfileBySubsidiaryIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSupplierProfileBySubsidiaryIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSupplierProfileBySubsidiaryIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSupplierProfileBySubsidiaryIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSupplierProfileBySubsidiaryIdResponse500> UnknownServerError
   */
  updateSupplierProfileBySubsidiaryId(body: types.UpdateSupplierProfileBySubsidiaryIdBodyParam, metadata: types.UpdateSupplierProfileBySubsidiaryIdMetadataParam): Promise<FetchResponse<200, types.UpdateSupplierProfileBySubsidiaryIdResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles/{subsidiaryId}', 'patch', body, metadata);
  }

  /**
   * Retrieve detailed supplier profile data by subsidiary remote ID
   *
   * @summary Get supplier profile by subsidiary remote ID
   * @throws FetchError<400, types.GetSupplierProfileBySubsidiaryRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetSupplierProfileBySubsidiaryRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetSupplierProfileBySubsidiaryRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetSupplierProfileBySubsidiaryRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetSupplierProfileBySubsidiaryRemoteIdResponse500> UnknownServerError
   */
  getSupplierProfileBySubsidiaryRemoteId(metadata: types.GetSupplierProfileBySubsidiaryRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetSupplierProfileBySubsidiaryRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles/{subsidiaryRemoteId}', 'get', metadata);
  }

  /**
   * Update an existing supplier profile for a specific subsidiary by remote ID. Supports
   * partial updates - only provided fields will be updated.
   *
   * @summary Update supplier profile by subsidiary remote ID
   * @throws FetchError<400, types.UpdateSupplierProfileBySubsidiaryRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateSupplierProfileBySubsidiaryRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateSupplierProfileBySubsidiaryRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateSupplierProfileBySubsidiaryRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateSupplierProfileBySubsidiaryRemoteIdResponse500> UnknownServerError
   */
  updateSupplierProfileBySubsidiaryRemoteId(body: types.UpdateSupplierProfileBySubsidiaryRemoteIdBodyParam, metadata: types.UpdateSupplierProfileBySubsidiaryRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateSupplierProfileBySubsidiaryRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles/{subsidiaryRemoteId}', 'patch', body, metadata);
  }

  /**
   * Link bank accounts to a supplier. If the bank account already exists, it will be
   * updated. Otherwise, it will be created.
   *
   * @summary Link bank accounts to supplier. If the bank account already exists, it will be updated.
   * Otherwise, it will be created.
   * @throws FetchError<400, types.LinkSupplierBankAccountsResponse400> BadRequestError
   * @throws FetchError<401, types.LinkSupplierBankAccountsResponse401> UnauthorisedError
   * @throws FetchError<403, types.LinkSupplierBankAccountsResponse403> ForbiddenError
   * @throws FetchError<404, types.LinkSupplierBankAccountsResponse404> NotFoundError
   * @throws FetchError<500, types.LinkSupplierBankAccountsResponse500> UnknownServerError
   */
  linkSupplierBankAccounts(body: types.LinkSupplierBankAccountsBodyParam, metadata: types.LinkSupplierBankAccountsMetadataParam): Promise<FetchResponse<200, types.LinkSupplierBankAccountsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/bank-accounts/batch', 'post', body, metadata);
  }

  /**
   * Link bank accounts to a supplier by remote ID. If the bank account already exists, it
   * will be updated. Otherwise, it will be created.
   *
   * @summary Link bank accounts to supplier by remote ID. If the bank account already exists, it will
   * be updated. Otherwise, it will be created.
   * @throws FetchError<400, types.LinkSupplierBankAccountsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.LinkSupplierBankAccountsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.LinkSupplierBankAccountsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.LinkSupplierBankAccountsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.LinkSupplierBankAccountsByRemoteIdResponse500> UnknownServerError
   */
  linkSupplierBankAccountsByRemoteId(body: types.LinkSupplierBankAccountsByRemoteIdBodyParam, metadata: types.LinkSupplierBankAccountsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.LinkSupplierBankAccountsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/bank-accounts/batch', 'post', body, metadata);
  }

  /**
   * Get a paginated list of bank accounts for a supplier
   *
   * @summary List bank accounts for supplier
   * @throws FetchError<400, types.ListSupplierBankAccountsResponse400> BadRequestError
   * @throws FetchError<401, types.ListSupplierBankAccountsResponse401> UnauthorisedError
   * @throws FetchError<403, types.ListSupplierBankAccountsResponse403> ForbiddenError
   * @throws FetchError<404, types.ListSupplierBankAccountsResponse404> NotFoundError
   * @throws FetchError<500, types.ListSupplierBankAccountsResponse500> UnknownServerError
   */
  listSupplierBankAccounts(metadata: types.ListSupplierBankAccountsMetadataParam): Promise<FetchResponse<200, types.ListSupplierBankAccountsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/bank-accounts', 'get', metadata);
  }

  /**
   * Get a paginated list of bank accounts for a supplier by remote ID
   *
   * @summary List bank accounts for supplier by remote ID
   * @throws FetchError<400, types.ListSupplierBankAccountsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.ListSupplierBankAccountsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.ListSupplierBankAccountsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.ListSupplierBankAccountsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.ListSupplierBankAccountsByRemoteIdResponse500> UnknownServerError
   */
  listSupplierBankAccountsByRemoteId(metadata: types.ListSupplierBankAccountsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.ListSupplierBankAccountsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/bank-accounts', 'get', metadata);
  }

  /**
   * Unlink a bank account from a supplier
   *
   * @summary Unlink bank account from supplier
   * @throws FetchError<400, types.UnlinkSupplierBankAccountResponse400> BadRequestError
   * @throws FetchError<401, types.UnlinkSupplierBankAccountResponse401> UnauthorisedError
   * @throws FetchError<403, types.UnlinkSupplierBankAccountResponse403> ForbiddenError
   * @throws FetchError<404, types.UnlinkSupplierBankAccountResponse404> NotFoundError
   * @throws FetchError<500, types.UnlinkSupplierBankAccountResponse500> UnknownServerError
   */
  unlinkSupplierBankAccount(metadata: types.UnlinkSupplierBankAccountMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/bank-accounts/{bankAccountId}', 'delete', metadata);
  }

  /**
   * Unlink a bank account from a supplier by remote ID
   *
   * @summary Unlink bank account from supplier by remote ID
   * @throws FetchError<400, types.UnlinkSupplierBankAccountByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UnlinkSupplierBankAccountByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UnlinkSupplierBankAccountByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UnlinkSupplierBankAccountByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UnlinkSupplierBankAccountByRemoteIdResponse500> UnknownServerError
   */
  unlinkSupplierBankAccountByRemoteId(metadata: types.UnlinkSupplierBankAccountByRemoteIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/bank-accounts/{bankAccountRemoteId}', 'delete', metadata);
  }

  /**
   * Link bank accounts to a supplier profile. Currently limited to 1 bank account per
   * supplier profile.
   *
   * @summary Link bank accounts to supplier profile
   * @throws FetchError<400, types.LinkProfileBankAccountsResponse400> BadRequestError
   * @throws FetchError<401, types.LinkProfileBankAccountsResponse401> UnauthorisedError
   * @throws FetchError<403, types.LinkProfileBankAccountsResponse403> ForbiddenError
   * @throws FetchError<404, types.LinkProfileBankAccountsResponse404> NotFoundError
   * @throws FetchError<500, types.LinkProfileBankAccountsResponse500> UnknownServerError
   */
  linkProfileBankAccounts(body: types.LinkProfileBankAccountsBodyParam, metadata: types.LinkProfileBankAccountsMetadataParam): Promise<FetchResponse<200, types.LinkProfileBankAccountsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles/{subsidiaryId}/bank-accounts/batch', 'post', body, metadata);
  }

  /**
   * Link bank accounts to a supplier profile by remote ID. Currently limited to 1 bank
   * account per supplier profile.
   *
   * @summary Link bank accounts to supplier profile by remote ID
   * @throws FetchError<400, types.LinkProfileBankAccountsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.LinkProfileBankAccountsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.LinkProfileBankAccountsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.LinkProfileBankAccountsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.LinkProfileBankAccountsByRemoteIdResponse500> UnknownServerError
   */
  linkProfileBankAccountsByRemoteId(body: types.LinkProfileBankAccountsByRemoteIdBodyParam, metadata: types.LinkProfileBankAccountsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.LinkProfileBankAccountsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles/{subsidiaryRemoteId}/bank-accounts/batch', 'post', body, metadata);
  }

  /**
   * Get a paginated list of bank accounts for a supplier profile. Currently limited to 1
   * bank account per supplier profile.
   *
   * @summary List bank accounts for supplier profile
   * @throws FetchError<400, types.ListProfileBankAccountsResponse400> BadRequestError
   * @throws FetchError<401, types.ListProfileBankAccountsResponse401> UnauthorisedError
   * @throws FetchError<403, types.ListProfileBankAccountsResponse403> ForbiddenError
   * @throws FetchError<404, types.ListProfileBankAccountsResponse404> NotFoundError
   * @throws FetchError<500, types.ListProfileBankAccountsResponse500> UnknownServerError
   */
  listProfileBankAccounts(metadata: types.ListProfileBankAccountsMetadataParam): Promise<FetchResponse<200, types.ListProfileBankAccountsResponse200>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles/{subsidiaryId}/bank-accounts', 'get', metadata);
  }

  /**
   * Get a paginated list of bank accounts for a supplier profile by remote ID. Currently
   * limited to 1 bank account per supplier profile.
   *
   * @summary List bank accounts for supplier profile by remote ID
   * @throws FetchError<400, types.ListProfileBankAccountsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.ListProfileBankAccountsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.ListProfileBankAccountsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.ListProfileBankAccountsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.ListProfileBankAccountsByRemoteIdResponse500> UnknownServerError
   */
  listProfileBankAccountsByRemoteId(metadata: types.ListProfileBankAccountsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.ListProfileBankAccountsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles/{subsidiaryRemoteId}/bank-accounts', 'get', metadata);
  }

  /**
   * Unlink a bank account from a supplier profile
   *
   * @summary Unlink bank account from supplier profile
   * @throws FetchError<400, types.UnlinkProfileBankAccountResponse400> BadRequestError
   * @throws FetchError<401, types.UnlinkProfileBankAccountResponse401> UnauthorisedError
   * @throws FetchError<403, types.UnlinkProfileBankAccountResponse403> ForbiddenError
   * @throws FetchError<404, types.UnlinkProfileBankAccountResponse404> NotFoundError
   * @throws FetchError<500, types.UnlinkProfileBankAccountResponse500> UnknownServerError
   */
  unlinkProfileBankAccount(metadata: types.UnlinkProfileBankAccountMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/suppliers/{supplierId}/profiles/{subsidiaryId}/bank-accounts/{bankAccountId}', 'delete', metadata);
  }

  /**
   * Unlink a bank account from a supplier profile by remote ID
   *
   * @summary Unlink bank account from supplier profile by remote ID
   * @throws FetchError<400, types.UnlinkProfileBankAccountByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UnlinkProfileBankAccountByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UnlinkProfileBankAccountByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UnlinkProfileBankAccountByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UnlinkProfileBankAccountByRemoteIdResponse500> UnknownServerError
   */
  unlinkProfileBankAccountByRemoteId(metadata: types.UnlinkProfileBankAccountByRemoteIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/suppliers/{supplierRemoteId}/profiles/{subsidiaryRemoteId}/bank-accounts/{bankAccountRemoteId}', 'delete', metadata);
  }

  /**
   * Update an existing bank account
   *
   * @summary Update bank account
   * @throws FetchError<400, types.UpdateBankAccountByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateBankAccountByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateBankAccountByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateBankAccountByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateBankAccountByIdResponse500> UnknownServerError
   */
  updateBankAccountById(body: types.UpdateBankAccountByIdBodyParam, metadata: types.UpdateBankAccountByIdMetadataParam): Promise<FetchResponse<200, types.UpdateBankAccountByIdResponse200>> {
    return this.core.fetch('/v1/bank-accounts/{bankAccountId}', 'patch', body, metadata);
  }

  /**
   * Update an existing bank account by remote ID
   *
   * @summary Update bank account by remote ID
   * @throws FetchError<400, types.UpdateBankAccountByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateBankAccountByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateBankAccountByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateBankAccountByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateBankAccountByRemoteIdResponse500> UnknownServerError
   */
  updateBankAccountByRemoteId(body: types.UpdateBankAccountByRemoteIdBodyParam, metadata: types.UpdateBankAccountByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdateBankAccountByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/bank-accounts/{bankAccountRemoteId}', 'patch', body, metadata);
  }

  /**
   * Get a paginated list of purchase orders
   *
   * @summary Get purchase orders
   * @throws FetchError<400, types.GetPurchaseOrdersResponse400> BadRequestError
   * @throws FetchError<401, types.GetPurchaseOrdersResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPurchaseOrdersResponse403> ForbiddenError
   * @throws FetchError<500, types.GetPurchaseOrdersResponse500> UnknownServerError
   */
  getPurchaseOrders(metadata?: types.GetPurchaseOrdersMetadataParam): Promise<FetchResponse<200, types.GetPurchaseOrdersResponse200>> {
    return this.core.fetch('/v1/purchase-orders', 'get', metadata);
  }

  /**
   * Get a single purchase order by ID
   *
   * @summary Get purchase order by ID
   * @throws FetchError<400, types.GetPurchaseOrderByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPurchaseOrderByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPurchaseOrderByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPurchaseOrderByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPurchaseOrderByIdResponse500> UnknownServerError
   */
  getPurchaseOrderById(metadata: types.GetPurchaseOrderByIdMetadataParam): Promise<FetchResponse<200, types.GetPurchaseOrderByIdResponse200>> {
    return this.core.fetch('/v1/purchase-orders/{purchaseOrderId}', 'get', metadata);
  }

  /**
   * Update a purchase order by ID. Only provided fields will be updated.
   *
   * @summary Update purchase order by ID
   * @throws FetchError<400, types.UpdatePurchaseOrderByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePurchaseOrderByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePurchaseOrderByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePurchaseOrderByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePurchaseOrderByIdResponse500> UnknownServerError
   */
  updatePurchaseOrderById(body: types.UpdatePurchaseOrderByIdBodyParam, metadata: types.UpdatePurchaseOrderByIdMetadataParam): Promise<FetchResponse<200, types.UpdatePurchaseOrderByIdResponse200>> {
    return this.core.fetch('/v1/purchase-orders/{purchaseOrderId}', 'patch', body, metadata);
  }

  /**
   * Delete a purchase order by ID. After successful deletion, you must rerun the Create PO
   * block in Omnea to ensure a new purchase order is created if the request is to continue.
   *
   * @summary Delete purchase order by ID
   * @throws FetchError<400, types.DeletePurchaseOrderByIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeletePurchaseOrderByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeletePurchaseOrderByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeletePurchaseOrderByIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeletePurchaseOrderByIdResponse500> UnknownServerError
   */
  deletePurchaseOrderById(metadata: types.DeletePurchaseOrderByIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/purchase-orders/{purchaseOrderId}', 'delete', metadata);
  }

  /**
   * Get a single purchase order by remote ID
   *
   * @summary Get purchase order by remote ID
   * @throws FetchError<400, types.GetPurchaseOrderByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPurchaseOrderByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPurchaseOrderByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPurchaseOrderByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPurchaseOrderByRemoteIdResponse500> UnknownServerError
   */
  getPurchaseOrderByRemoteId(metadata: types.GetPurchaseOrderByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetPurchaseOrderByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/purchase-orders/{purchaseOrderRemoteId}', 'get', metadata);
  }

  /**
   * Update a purchase order by remote ID. Only provided fields will be updated.
   *
   * @summary Update purchase order by remote ID
   * @throws FetchError<400, types.UpdatePurchaseOrderByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePurchaseOrderByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePurchaseOrderByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePurchaseOrderByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePurchaseOrderByRemoteIdResponse500> UnknownServerError
   */
  updatePurchaseOrderByRemoteId(body: types.UpdatePurchaseOrderByRemoteIdBodyParam, metadata: types.UpdatePurchaseOrderByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdatePurchaseOrderByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/purchase-orders/{purchaseOrderRemoteId}', 'patch', body, metadata);
  }

  /**
   * Delete a purchase order by remote ID. After successful deletion, you must rerun the
   * Create PO block in Omnea to ensure a new purchase order is created if the request is to
   * continue.
   *
   * @summary Delete purchase order by remote ID
   * @throws FetchError<400, types.DeletePurchaseOrderByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.DeletePurchaseOrderByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.DeletePurchaseOrderByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.DeletePurchaseOrderByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.DeletePurchaseOrderByRemoteIdResponse500> UnknownServerError
   */
  deletePurchaseOrderByRemoteId(metadata: types.DeletePurchaseOrderByRemoteIdMetadataParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/v1/by-remote-id/purchase-orders/{purchaseOrderRemoteId}', 'delete', metadata);
  }

  /**
   * Get line items for a purchase order by ID
   *
   * @summary Get purchase order line items by ID
   * @throws FetchError<400, types.GetPurchaseOrderLineItemsByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPurchaseOrderLineItemsByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPurchaseOrderLineItemsByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPurchaseOrderLineItemsByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPurchaseOrderLineItemsByIdResponse500> UnknownServerError
   */
  getPurchaseOrderLineItemsById(metadata: types.GetPurchaseOrderLineItemsByIdMetadataParam): Promise<FetchResponse<200, types.GetPurchaseOrderLineItemsByIdResponse200>> {
    return this.core.fetch('/v1/purchase-orders/{purchaseOrderId}/line-items', 'get', metadata);
  }

  /**
   * Get line items for a purchase order by remote ID
   *
   * @summary Get purchase order line items by remote ID
   * @throws FetchError<400, types.GetPurchaseOrderLineItemsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetPurchaseOrderLineItemsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetPurchaseOrderLineItemsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetPurchaseOrderLineItemsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetPurchaseOrderLineItemsByRemoteIdResponse500> UnknownServerError
   */
  getPurchaseOrderLineItemsByRemoteId(metadata: types.GetPurchaseOrderLineItemsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.GetPurchaseOrderLineItemsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/purchase-orders/{purchaseOrderRemoteId}/line-items', 'get', metadata);
  }

  /**
   * Create line items on a purchase order with standard fields and custom fields.
   *
   * @summary Create purchase order line items by ID
   * @throws FetchError<400, types.CreatePurchaseOrderLineItemsByIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreatePurchaseOrderLineItemsByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreatePurchaseOrderLineItemsByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.CreatePurchaseOrderLineItemsByIdResponse404> NotFoundError
   * @throws FetchError<500, types.CreatePurchaseOrderLineItemsByIdResponse500> UnknownServerError
   */
  createPurchaseOrderLineItemsById(body: types.CreatePurchaseOrderLineItemsByIdBodyParam, metadata: types.CreatePurchaseOrderLineItemsByIdMetadataParam): Promise<FetchResponse<200, types.CreatePurchaseOrderLineItemsByIdResponse200>> {
    return this.core.fetch('/v1/purchase-orders/{purchaseOrderId}/line-items/batch', 'post', body, metadata);
  }

  /**
   * Update standard fields and custom fields on a single purchase order line item. Only
   * provided fields will be updated.
   *
   * @summary Update a purchase order line item by ID
   * @throws FetchError<400, types.UpdatePurchaseOrderLineItemByIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePurchaseOrderLineItemByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePurchaseOrderLineItemByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePurchaseOrderLineItemByIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePurchaseOrderLineItemByIdResponse500> UnknownServerError
   */
  updatePurchaseOrderLineItemById(body: types.UpdatePurchaseOrderLineItemByIdBodyParam, metadata: types.UpdatePurchaseOrderLineItemByIdMetadataParam): Promise<FetchResponse<200, types.UpdatePurchaseOrderLineItemByIdResponse200>> {
    return this.core.fetch('/v1/purchase-orders/{purchaseOrderId}/line-items/{lineNumber}', 'patch', body, metadata);
  }

  /**
   * Update standard fields and custom fields on a single purchase order line item by remote
   * ID. Only provided fields will be updated.
   *
   * @summary Update a purchase order line item by remote ID
   * @throws FetchError<400, types.UpdatePurchaseOrderLineItemByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.UpdatePurchaseOrderLineItemByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdatePurchaseOrderLineItemByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdatePurchaseOrderLineItemByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.UpdatePurchaseOrderLineItemByRemoteIdResponse500> UnknownServerError
   */
  updatePurchaseOrderLineItemByRemoteId(body: types.UpdatePurchaseOrderLineItemByRemoteIdBodyParam, metadata: types.UpdatePurchaseOrderLineItemByRemoteIdMetadataParam): Promise<FetchResponse<200, types.UpdatePurchaseOrderLineItemByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/purchase-orders/{purchaseOrderRemoteId}/line-items/{lineNumber}', 'patch', body, metadata);
  }

  /**
   * Create line items on a purchase order with standard fields and custom fields.
   *
   * @summary Create purchase order line items by remote ID
   * @throws FetchError<400, types.CreatePurchaseOrderLineItemsByRemoteIdResponse400> BadRequestError
   * @throws FetchError<401, types.CreatePurchaseOrderLineItemsByRemoteIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.CreatePurchaseOrderLineItemsByRemoteIdResponse403> ForbiddenError
   * @throws FetchError<404, types.CreatePurchaseOrderLineItemsByRemoteIdResponse404> NotFoundError
   * @throws FetchError<500, types.CreatePurchaseOrderLineItemsByRemoteIdResponse500> UnknownServerError
   */
  createPurchaseOrderLineItemsByRemoteId(body: types.CreatePurchaseOrderLineItemsByRemoteIdBodyParam, metadata: types.CreatePurchaseOrderLineItemsByRemoteIdMetadataParam): Promise<FetchResponse<200, types.CreatePurchaseOrderLineItemsByRemoteIdResponse200>> {
    return this.core.fetch('/v1/by-remote-id/purchase-orders/{purchaseOrderRemoteId}/line-items/batch', 'post', body, metadata);
  }

  /**
   * List users with pagination support
   *
   * @summary Get users
   * @throws FetchError<400, types.GetUsersResponse400> BadRequestError
   * @throws FetchError<401, types.GetUsersResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetUsersResponse403> ForbiddenError
   * @throws FetchError<500, types.GetUsersResponse500> UnknownServerError
   */
  getUsers(metadata?: types.GetUsersMetadataParam): Promise<FetchResponse<200, types.GetUsersResponse200>> {
    return this.core.fetch('/v1/users', 'get', metadata);
  }

  /**
   * Get a user by ID
   *
   * @summary Get a user by ID
   * @throws FetchError<400, types.GetUserByIdResponse400> BadRequestError
   * @throws FetchError<401, types.GetUserByIdResponse401> UnauthorisedError
   * @throws FetchError<403, types.GetUserByIdResponse403> ForbiddenError
   * @throws FetchError<404, types.GetUserByIdResponse404> NotFoundError
   * @throws FetchError<500, types.GetUserByIdResponse500> UnknownServerError
   */
  getUserById(metadata: types.GetUserByIdMetadataParam): Promise<FetchResponse<200, types.GetUserByIdResponse200>> {
    return this.core.fetch('/v1/users/{userId}', 'get', metadata);
  }

  /**
   * Update multiple users in batch
   *
   * @summary Batch update users
   * @throws FetchError<400, types.UpdateUsersResponse400> BadRequestError
   * @throws FetchError<401, types.UpdateUsersResponse401> UnauthorisedError
   * @throws FetchError<403, types.UpdateUsersResponse403> ForbiddenError
   * @throws FetchError<404, types.UpdateUsersResponse404> NotFoundError
   * @throws FetchError<500, types.UpdateUsersResponse500> UnknownServerError
   */
  updateUsers(body: types.UpdateUsersBodyParam): Promise<FetchResponse<200, types.UpdateUsersResponse200>> {
    return this.core.fetch('/v1/users/batch', 'patch', body);
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { CreateAddressesBodyParam, CreateAddressesResponse200, CreateAddressesResponse400, CreateAddressesResponse401, CreateAddressesResponse403, CreateAddressesResponse409, CreateAddressesResponse500, CreateCurrenciesBodyParam, CreateCurrenciesResponse200, CreateCurrenciesResponse400, CreateCurrenciesResponse401, CreateCurrenciesResponse403, CreateCurrenciesResponse409, CreateCurrenciesResponse500, CreateCustomDataRecordsBodyParam, CreateCustomDataRecordsMetadataParam, CreateCustomDataRecordsResponse200, CreateCustomDataRecordsResponse400, CreateCustomDataRecordsResponse401, CreateCustomDataRecordsResponse403, CreateCustomDataRecordsResponse404, CreateCustomDataRecordsResponse409, CreateCustomDataRecordsResponse500, CreateDepartmentsBodyParam, CreateDepartmentsResponse200, CreateDepartmentsResponse400, CreateDepartmentsResponse401, CreateDepartmentsResponse403, CreateDepartmentsResponse409, CreateDepartmentsResponse500, CreateDependenciesBodyParam, CreateDependenciesByRemoteIdBodyParam, CreateDependenciesByRemoteIdForCustomDataBodyParam, CreateDependenciesByRemoteIdForCustomDataMetadataParam, CreateDependenciesByRemoteIdForCustomDataResponse200, CreateDependenciesByRemoteIdForCustomDataResponse400, CreateDependenciesByRemoteIdForCustomDataResponse401, CreateDependenciesByRemoteIdForCustomDataResponse403, CreateDependenciesByRemoteIdForCustomDataResponse500, CreateDependenciesByRemoteIdMetadataParam, CreateDependenciesByRemoteIdResponse200, CreateDependenciesByRemoteIdResponse400, CreateDependenciesByRemoteIdResponse401, CreateDependenciesByRemoteIdResponse403, CreateDependenciesByRemoteIdResponse500, CreateDependenciesForCustomDataBodyParam, CreateDependenciesForCustomDataMetadataParam, CreateDependenciesForCustomDataResponse200, CreateDependenciesForCustomDataResponse400, CreateDependenciesForCustomDataResponse401, CreateDependenciesForCustomDataResponse403, CreateDependenciesForCustomDataResponse500, CreateDependenciesMetadataParam, CreateDependenciesResponse200, CreateDependenciesResponse400, CreateDependenciesResponse401, CreateDependenciesResponse403, CreateDependenciesResponse500, CreateExternalContactsBodyParam, CreateExternalContactsByRemoteIdBodyParam, CreateExternalContactsByRemoteIdMetadataParam, CreateExternalContactsByRemoteIdResponse200, CreateExternalContactsByRemoteIdResponse400, CreateExternalContactsByRemoteIdResponse401, CreateExternalContactsByRemoteIdResponse403, CreateExternalContactsByRemoteIdResponse404, CreateExternalContactsByRemoteIdResponse409, CreateExternalContactsByRemoteIdResponse500, CreateExternalContactsMetadataParam, CreateExternalContactsResponse200, CreateExternalContactsResponse400, CreateExternalContactsResponse401, CreateExternalContactsResponse403, CreateExternalContactsResponse404, CreateExternalContactsResponse409, CreateExternalContactsResponse500, CreateInternalContactsBodyParam, CreateInternalContactsByRemoteIdBodyParam, CreateInternalContactsByRemoteIdMetadataParam, CreateInternalContactsByRemoteIdResponse200, CreateInternalContactsByRemoteIdResponse400, CreateInternalContactsByRemoteIdResponse401, CreateInternalContactsByRemoteIdResponse403, CreateInternalContactsByRemoteIdResponse404, CreateInternalContactsByRemoteIdResponse409, CreateInternalContactsByRemoteIdResponse500, CreateInternalContactsMetadataParam, CreateInternalContactsResponse200, CreateInternalContactsResponse400, CreateInternalContactsResponse401, CreateInternalContactsResponse403, CreateInternalContactsResponse404, CreateInternalContactsResponse409, CreateInternalContactsResponse500, CreateLineItemTypesBodyParam, CreateLineItemTypesResponse200, CreateLineItemTypesResponse400, CreateLineItemTypesResponse401, CreateLineItemTypesResponse403, CreateLineItemTypesResponse409, CreateLineItemTypesResponse500, CreatePaymentMethodsBodyParam, CreatePaymentMethodsResponse200, CreatePaymentMethodsResponse400, CreatePaymentMethodsResponse401, CreatePaymentMethodsResponse403, CreatePaymentMethodsResponse409, CreatePaymentMethodsResponse500, CreatePaymentTermsBodyParam, CreatePaymentTermsResponse200, CreatePaymentTermsResponse400, CreatePaymentTermsResponse401, CreatePaymentTermsResponse403, CreatePaymentTermsResponse409, CreatePaymentTermsResponse500, CreatePurchaseOrderLineItemsByIdBodyParam, CreatePurchaseOrderLineItemsByIdMetadataParam, CreatePurchaseOrderLineItemsByIdResponse200, CreatePurchaseOrderLineItemsByIdResponse400, CreatePurchaseOrderLineItemsByIdResponse401, CreatePurchaseOrderLineItemsByIdResponse403, CreatePurchaseOrderLineItemsByIdResponse404, CreatePurchaseOrderLineItemsByIdResponse500, CreatePurchaseOrderLineItemsByRemoteIdBodyParam, CreatePurchaseOrderLineItemsByRemoteIdMetadataParam, CreatePurchaseOrderLineItemsByRemoteIdResponse200, CreatePurchaseOrderLineItemsByRemoteIdResponse400, CreatePurchaseOrderLineItemsByRemoteIdResponse401, CreatePurchaseOrderLineItemsByRemoteIdResponse403, CreatePurchaseOrderLineItemsByRemoteIdResponse404, CreatePurchaseOrderLineItemsByRemoteIdResponse500, CreateSubsidiariesBodyParam, CreateSubsidiariesResponse200, CreateSubsidiariesResponse400, CreateSubsidiariesResponse401, CreateSubsidiariesResponse403, CreateSubsidiariesResponse409, CreateSubsidiariesResponse500, CreateSupplierProfilesBodyParam, CreateSupplierProfilesByRemoteIdBodyParam, CreateSupplierProfilesByRemoteIdMetadataParam, CreateSupplierProfilesByRemoteIdResponse200, CreateSupplierProfilesByRemoteIdResponse400, CreateSupplierProfilesByRemoteIdResponse401, CreateSupplierProfilesByRemoteIdResponse403, CreateSupplierProfilesByRemoteIdResponse404, CreateSupplierProfilesByRemoteIdResponse409, CreateSupplierProfilesByRemoteIdResponse500, CreateSupplierProfilesMetadataParam, CreateSupplierProfilesResponse200, CreateSupplierProfilesResponse400, CreateSupplierProfilesResponse401, CreateSupplierProfilesResponse403, CreateSupplierProfilesResponse404, CreateSupplierProfilesResponse409, CreateSupplierProfilesResponse500, CreateSupplierSubsidiariesBodyParam, CreateSupplierSubsidiariesByRemoteIdBodyParam, CreateSupplierSubsidiariesByRemoteIdMetadataParam, CreateSupplierSubsidiariesByRemoteIdResponse200, CreateSupplierSubsidiariesByRemoteIdResponse400, CreateSupplierSubsidiariesByRemoteIdResponse401, CreateSupplierSubsidiariesByRemoteIdResponse403, CreateSupplierSubsidiariesByRemoteIdResponse404, CreateSupplierSubsidiariesByRemoteIdResponse500, CreateSupplierSubsidiariesMetadataParam, CreateSupplierSubsidiariesResponse200, CreateSupplierSubsidiariesResponse400, CreateSupplierSubsidiariesResponse401, CreateSupplierSubsidiariesResponse403, CreateSupplierSubsidiariesResponse404, CreateSupplierSubsidiariesResponse500, CreateSuppliersBodyParam, CreateSuppliersResponse200, CreateSuppliersResponse400, CreateSuppliersResponse401, CreateSuppliersResponse403, CreateSuppliersResponse500, DeleteDependencyByRemoteIdForCustomDataMetadataParam, DeleteDependencyByRemoteIdForCustomDataResponse400, DeleteDependencyByRemoteIdForCustomDataResponse401, DeleteDependencyByRemoteIdForCustomDataResponse403, DeleteDependencyByRemoteIdForCustomDataResponse404, DeleteDependencyByRemoteIdForCustomDataResponse500, DeleteDependencyByRemoteIdMetadataParam, DeleteDependencyByRemoteIdResponse400, DeleteDependencyByRemoteIdResponse401, DeleteDependencyByRemoteIdResponse403, DeleteDependencyByRemoteIdResponse404, DeleteDependencyByRemoteIdResponse500, DeleteDependencyForCustomDataMetadataParam, DeleteDependencyForCustomDataResponse400, DeleteDependencyForCustomDataResponse401, DeleteDependencyForCustomDataResponse403, DeleteDependencyForCustomDataResponse404, DeleteDependencyForCustomDataResponse500, DeleteDependencyMetadataParam, DeleteDependencyResponse400, DeleteDependencyResponse401, DeleteDependencyResponse403, DeleteDependencyResponse404, DeleteDependencyResponse500, DeleteExternalContactByIdMetadataParam, DeleteExternalContactByIdResponse400, DeleteExternalContactByIdResponse401, DeleteExternalContactByIdResponse403, DeleteExternalContactByIdResponse404, DeleteExternalContactByIdResponse500, DeleteExternalContactByRemoteIdMetadataParam, DeleteExternalContactByRemoteIdResponse400, DeleteExternalContactByRemoteIdResponse401, DeleteExternalContactByRemoteIdResponse403, DeleteExternalContactByRemoteIdResponse404, DeleteExternalContactByRemoteIdResponse500, DeleteInternalContactByIdMetadataParam, DeleteInternalContactByIdResponse400, DeleteInternalContactByIdResponse401, DeleteInternalContactByIdResponse403, DeleteInternalContactByIdResponse404, DeleteInternalContactByIdResponse500, DeleteInternalContactByRemoteIdMetadataParam, DeleteInternalContactByRemoteIdResponse400, DeleteInternalContactByRemoteIdResponse401, DeleteInternalContactByRemoteIdResponse403, DeleteInternalContactByRemoteIdResponse404, DeleteInternalContactByRemoteIdResponse500, DeletePurchaseOrderByIdMetadataParam, DeletePurchaseOrderByIdResponse400, DeletePurchaseOrderByIdResponse401, DeletePurchaseOrderByIdResponse403, DeletePurchaseOrderByIdResponse404, DeletePurchaseOrderByIdResponse500, DeletePurchaseOrderByRemoteIdMetadataParam, DeletePurchaseOrderByRemoteIdResponse400, DeletePurchaseOrderByRemoteIdResponse401, DeletePurchaseOrderByRemoteIdResponse403, DeletePurchaseOrderByRemoteIdResponse404, DeletePurchaseOrderByRemoteIdResponse500, DeleteSupplierSubsidiaryByRemoteIdMetadataParam, DeleteSupplierSubsidiaryByRemoteIdResponse200, DeleteSupplierSubsidiaryByRemoteIdResponse400, DeleteSupplierSubsidiaryByRemoteIdResponse401, DeleteSupplierSubsidiaryByRemoteIdResponse403, DeleteSupplierSubsidiaryByRemoteIdResponse404, DeleteSupplierSubsidiaryByRemoteIdResponse500, DeleteSupplierSubsidiaryMetadataParam, DeleteSupplierSubsidiaryResponse200, DeleteSupplierSubsidiaryResponse400, DeleteSupplierSubsidiaryResponse401, DeleteSupplierSubsidiaryResponse403, DeleteSupplierSubsidiaryResponse404, DeleteSupplierSubsidiaryResponse500, GetAddressByIdMetadataParam, GetAddressByIdResponse200, GetAddressByIdResponse400, GetAddressByIdResponse401, GetAddressByIdResponse403, GetAddressByIdResponse404, GetAddressByIdResponse500, GetAddressByRemoteIdMetadataParam, GetAddressByRemoteIdResponse200, GetAddressByRemoteIdResponse400, GetAddressByRemoteIdResponse401, GetAddressByRemoteIdResponse403, GetAddressByRemoteIdResponse404, GetAddressByRemoteIdResponse500, GetAddressesMetadataParam, GetAddressesResponse200, GetAddressesResponse400, GetAddressesResponse401, GetAddressesResponse403, GetAddressesResponse500, GetCurrenciesMetadataParam, GetCurrenciesResponse200, GetCurrenciesResponse400, GetCurrenciesResponse401, GetCurrenciesResponse403, GetCurrenciesResponse500, GetCurrencyByIdMetadataParam, GetCurrencyByIdResponse200, GetCurrencyByIdResponse400, GetCurrencyByIdResponse401, GetCurrencyByIdResponse403, GetCurrencyByIdResponse404, GetCurrencyByIdResponse500, GetCurrencyByRemoteIdMetadataParam, GetCurrencyByRemoteIdResponse200, GetCurrencyByRemoteIdResponse400, GetCurrencyByRemoteIdResponse401, GetCurrencyByRemoteIdResponse403, GetCurrencyByRemoteIdResponse404, GetCurrencyByRemoteIdResponse500, GetCustomDataBySlugMetadataParam, GetCustomDataBySlugResponse200, GetCustomDataBySlugResponse400, GetCustomDataBySlugResponse401, GetCustomDataBySlugResponse403, GetCustomDataBySlugResponse404, GetCustomDataBySlugResponse500, GetCustomDataMetadataParam, GetCustomDataRecordByIdMetadataParam, GetCustomDataRecordByIdResponse200, GetCustomDataRecordByIdResponse400, GetCustomDataRecordByIdResponse401, GetCustomDataRecordByIdResponse403, GetCustomDataRecordByIdResponse404, GetCustomDataRecordByIdResponse500, GetCustomDataRecordByRemoteIdMetadataParam, GetCustomDataRecordByRemoteIdResponse200, GetCustomDataRecordByRemoteIdResponse400, GetCustomDataRecordByRemoteIdResponse401, GetCustomDataRecordByRemoteIdResponse403, GetCustomDataRecordByRemoteIdResponse404, GetCustomDataRecordByRemoteIdResponse500, GetCustomDataRecordsMetadataParam, GetCustomDataRecordsResponse200, GetCustomDataRecordsResponse400, GetCustomDataRecordsResponse401, GetCustomDataRecordsResponse403, GetCustomDataRecordsResponse500, GetCustomDataResponse200, GetCustomDataResponse400, GetCustomDataResponse401, GetCustomDataResponse403, GetCustomDataResponse500, GetDepartmentByIdMetadataParam, GetDepartmentByIdResponse200, GetDepartmentByIdResponse400, GetDepartmentByIdResponse401, GetDepartmentByIdResponse403, GetDepartmentByIdResponse404, GetDepartmentByIdResponse500, GetDepartmentByRemoteIdMetadataParam, GetDepartmentByRemoteIdResponse200, GetDepartmentByRemoteIdResponse400, GetDepartmentByRemoteIdResponse401, GetDepartmentByRemoteIdResponse403, GetDepartmentByRemoteIdResponse404, GetDepartmentByRemoteIdResponse500, GetDepartmentsMetadataParam, GetDepartmentsResponse200, GetDepartmentsResponse400, GetDepartmentsResponse401, GetDepartmentsResponse403, GetDepartmentsResponse500, GetDependenciesByRemoteIdForCustomDataMetadataParam, GetDependenciesByRemoteIdForCustomDataResponse200, GetDependenciesByRemoteIdForCustomDataResponse400, GetDependenciesByRemoteIdForCustomDataResponse401, GetDependenciesByRemoteIdForCustomDataResponse403, GetDependenciesByRemoteIdForCustomDataResponse500, GetDependenciesByRemoteIdMetadataParam, GetDependenciesByRemoteIdResponse200, GetDependenciesByRemoteIdResponse400, GetDependenciesByRemoteIdResponse401, GetDependenciesByRemoteIdResponse403, GetDependenciesByRemoteIdResponse500, GetDependenciesForCustomDataMetadataParam, GetDependenciesForCustomDataResponse200, GetDependenciesForCustomDataResponse400, GetDependenciesForCustomDataResponse401, GetDependenciesForCustomDataResponse403, GetDependenciesForCustomDataResponse500, GetDependenciesMetadataParam, GetDependenciesResponse200, GetDependenciesResponse400, GetDependenciesResponse401, GetDependenciesResponse403, GetDependenciesResponse500, GetExternalContactByIdMetadataParam, GetExternalContactByIdResponse200, GetExternalContactByIdResponse400, GetExternalContactByIdResponse401, GetExternalContactByIdResponse403, GetExternalContactByIdResponse404, GetExternalContactByIdResponse500, GetExternalContactByRemoteIdMetadataParam, GetExternalContactByRemoteIdResponse200, GetExternalContactByRemoteIdResponse400, GetExternalContactByRemoteIdResponse401, GetExternalContactByRemoteIdResponse403, GetExternalContactByRemoteIdResponse404, GetExternalContactByRemoteIdResponse500, GetExternalContactsByRemoteIdMetadataParam, GetExternalContactsByRemoteIdResponse200, GetExternalContactsByRemoteIdResponse400, GetExternalContactsByRemoteIdResponse401, GetExternalContactsByRemoteIdResponse403, GetExternalContactsByRemoteIdResponse404, GetExternalContactsByRemoteIdResponse500, GetExternalContactsMetadataParam, GetExternalContactsResponse200, GetExternalContactsResponse400, GetExternalContactsResponse401, GetExternalContactsResponse403, GetExternalContactsResponse404, GetExternalContactsResponse500, GetInternalContactByIdMetadataParam, GetInternalContactByIdResponse200, GetInternalContactByIdResponse400, GetInternalContactByIdResponse401, GetInternalContactByIdResponse403, GetInternalContactByIdResponse404, GetInternalContactByIdResponse500, GetInternalContactByRemoteIdMetadataParam, GetInternalContactByRemoteIdResponse200, GetInternalContactByRemoteIdResponse400, GetInternalContactByRemoteIdResponse401, GetInternalContactByRemoteIdResponse403, GetInternalContactByRemoteIdResponse404, GetInternalContactByRemoteIdResponse500, GetInternalContactsByRemoteIdMetadataParam, GetInternalContactsByRemoteIdResponse200, GetInternalContactsByRemoteIdResponse400, GetInternalContactsByRemoteIdResponse401, GetInternalContactsByRemoteIdResponse403, GetInternalContactsByRemoteIdResponse404, GetInternalContactsByRemoteIdResponse500, GetInternalContactsMetadataParam, GetInternalContactsResponse200, GetInternalContactsResponse400, GetInternalContactsResponse401, GetInternalContactsResponse403, GetInternalContactsResponse404, GetInternalContactsResponse500, GetLineItemTypeByIdMetadataParam, GetLineItemTypeByIdResponse200, GetLineItemTypeByIdResponse400, GetLineItemTypeByIdResponse401, GetLineItemTypeByIdResponse403, GetLineItemTypeByIdResponse404, GetLineItemTypeByIdResponse500, GetLineItemTypeByRemoteIdMetadataParam, GetLineItemTypeByRemoteIdResponse200, GetLineItemTypeByRemoteIdResponse400, GetLineItemTypeByRemoteIdResponse401, GetLineItemTypeByRemoteIdResponse403, GetLineItemTypeByRemoteIdResponse404, GetLineItemTypeByRemoteIdResponse500, GetLineItemTypesMetadataParam, GetLineItemTypesResponse200, GetLineItemTypesResponse400, GetLineItemTypesResponse401, GetLineItemTypesResponse403, GetLineItemTypesResponse500, GetPaymentMethodByIdMetadataParam, GetPaymentMethodByIdResponse200, GetPaymentMethodByIdResponse400, GetPaymentMethodByIdResponse401, GetPaymentMethodByIdResponse403, GetPaymentMethodByIdResponse500, GetPaymentMethodByRemoteIdMetadataParam, GetPaymentMethodByRemoteIdResponse200, GetPaymentMethodByRemoteIdResponse400, GetPaymentMethodByRemoteIdResponse401, GetPaymentMethodByRemoteIdResponse403, GetPaymentMethodByRemoteIdResponse404, GetPaymentMethodByRemoteIdResponse500, GetPaymentMethodsMetadataParam, GetPaymentMethodsResponse200, GetPaymentMethodsResponse400, GetPaymentMethodsResponse401, GetPaymentMethodsResponse403, GetPaymentMethodsResponse500, GetPaymentTermByIdMetadataParam, GetPaymentTermByIdResponse200, GetPaymentTermByIdResponse400, GetPaymentTermByIdResponse401, GetPaymentTermByIdResponse403, GetPaymentTermByIdResponse404, GetPaymentTermByIdResponse500, GetPaymentTermByRemoteIdMetadataParam, GetPaymentTermByRemoteIdResponse200, GetPaymentTermByRemoteIdResponse400, GetPaymentTermByRemoteIdResponse401, GetPaymentTermByRemoteIdResponse403, GetPaymentTermByRemoteIdResponse404, GetPaymentTermByRemoteIdResponse500, GetPaymentTermsMetadataParam, GetPaymentTermsResponse200, GetPaymentTermsResponse400, GetPaymentTermsResponse401, GetPaymentTermsResponse403, GetPaymentTermsResponse500, GetPurchaseOrderByIdMetadataParam, GetPurchaseOrderByIdResponse200, GetPurchaseOrderByIdResponse400, GetPurchaseOrderByIdResponse401, GetPurchaseOrderByIdResponse403, GetPurchaseOrderByIdResponse404, GetPurchaseOrderByIdResponse500, GetPurchaseOrderByRemoteIdMetadataParam, GetPurchaseOrderByRemoteIdResponse200, GetPurchaseOrderByRemoteIdResponse400, GetPurchaseOrderByRemoteIdResponse401, GetPurchaseOrderByRemoteIdResponse403, GetPurchaseOrderByRemoteIdResponse404, GetPurchaseOrderByRemoteIdResponse500, GetPurchaseOrderLineItemsByIdMetadataParam, GetPurchaseOrderLineItemsByIdResponse200, GetPurchaseOrderLineItemsByIdResponse400, GetPurchaseOrderLineItemsByIdResponse401, GetPurchaseOrderLineItemsByIdResponse403, GetPurchaseOrderLineItemsByIdResponse404, GetPurchaseOrderLineItemsByIdResponse500, GetPurchaseOrderLineItemsByRemoteIdMetadataParam, GetPurchaseOrderLineItemsByRemoteIdResponse200, GetPurchaseOrderLineItemsByRemoteIdResponse400, GetPurchaseOrderLineItemsByRemoteIdResponse401, GetPurchaseOrderLineItemsByRemoteIdResponse403, GetPurchaseOrderLineItemsByRemoteIdResponse404, GetPurchaseOrderLineItemsByRemoteIdResponse500, GetPurchaseOrdersMetadataParam, GetPurchaseOrdersResponse200, GetPurchaseOrdersResponse400, GetPurchaseOrdersResponse401, GetPurchaseOrdersResponse403, GetPurchaseOrdersResponse500, GetSubsidiariesMetadataParam, GetSubsidiariesResponse200, GetSubsidiariesResponse400, GetSubsidiariesResponse401, GetSubsidiariesResponse403, GetSubsidiariesResponse500, GetSubsidiaryByIdMetadataParam, GetSubsidiaryByIdResponse200, GetSubsidiaryByIdResponse400, GetSubsidiaryByIdResponse401, GetSubsidiaryByIdResponse403, GetSubsidiaryByIdResponse404, GetSubsidiaryByIdResponse500, GetSubsidiaryByRemoteIdMetadataParam, GetSubsidiaryByRemoteIdResponse200, GetSubsidiaryByRemoteIdResponse400, GetSubsidiaryByRemoteIdResponse401, GetSubsidiaryByRemoteIdResponse403, GetSubsidiaryByRemoteIdResponse404, GetSubsidiaryByRemoteIdResponse500, GetSupplierByIdMetadataParam, GetSupplierByIdResponse200, GetSupplierByIdResponse400, GetSupplierByIdResponse401, GetSupplierByIdResponse403, GetSupplierByIdResponse404, GetSupplierByIdResponse500, GetSupplierByRemoteIdMetadataParam, GetSupplierByRemoteIdResponse200, GetSupplierByRemoteIdResponse400, GetSupplierByRemoteIdResponse401, GetSupplierByRemoteIdResponse403, GetSupplierByRemoteIdResponse404, GetSupplierByRemoteIdResponse500, GetSupplierProfileBySubsidiaryIdMetadataParam, GetSupplierProfileBySubsidiaryIdResponse200, GetSupplierProfileBySubsidiaryIdResponse400, GetSupplierProfileBySubsidiaryIdResponse401, GetSupplierProfileBySubsidiaryIdResponse403, GetSupplierProfileBySubsidiaryIdResponse404, GetSupplierProfileBySubsidiaryIdResponse500, GetSupplierProfileBySubsidiaryRemoteIdMetadataParam, GetSupplierProfileBySubsidiaryRemoteIdResponse200, GetSupplierProfileBySubsidiaryRemoteIdResponse400, GetSupplierProfileBySubsidiaryRemoteIdResponse401, GetSupplierProfileBySubsidiaryRemoteIdResponse403, GetSupplierProfileBySubsidiaryRemoteIdResponse404, GetSupplierProfileBySubsidiaryRemoteIdResponse500, GetSupplierProfilesByRemoteIdMetadataParam, GetSupplierProfilesByRemoteIdResponse200, GetSupplierProfilesByRemoteIdResponse400, GetSupplierProfilesByRemoteIdResponse401, GetSupplierProfilesByRemoteIdResponse403, GetSupplierProfilesByRemoteIdResponse404, GetSupplierProfilesByRemoteIdResponse500, GetSupplierProfilesMetadataParam, GetSupplierProfilesResponse200, GetSupplierProfilesResponse400, GetSupplierProfilesResponse401, GetSupplierProfilesResponse403, GetSupplierProfilesResponse404, GetSupplierProfilesResponse500, GetSupplierSubsidiariesByRemoteIdMetadataParam, GetSupplierSubsidiariesByRemoteIdResponse200, GetSupplierSubsidiariesByRemoteIdResponse400, GetSupplierSubsidiariesByRemoteIdResponse401, GetSupplierSubsidiariesByRemoteIdResponse403, GetSupplierSubsidiariesByRemoteIdResponse404, GetSupplierSubsidiariesByRemoteIdResponse500, GetSupplierSubsidiariesMetadataParam, GetSupplierSubsidiariesResponse200, GetSupplierSubsidiariesResponse400, GetSupplierSubsidiariesResponse401, GetSupplierSubsidiariesResponse403, GetSupplierSubsidiariesResponse404, GetSupplierSubsidiariesResponse500, GetSuppliersMetadataParam, GetSuppliersResponse200, GetSuppliersResponse400, GetSuppliersResponse401, GetSuppliersResponse403, GetSuppliersResponse500, GetUserByIdMetadataParam, GetUserByIdResponse200, GetUserByIdResponse400, GetUserByIdResponse401, GetUserByIdResponse403, GetUserByIdResponse404, GetUserByIdResponse500, GetUsersMetadataParam, GetUsersResponse200, GetUsersResponse400, GetUsersResponse401, GetUsersResponse403, GetUsersResponse500, LinkProfileBankAccountsBodyParam, LinkProfileBankAccountsByRemoteIdBodyParam, LinkProfileBankAccountsByRemoteIdMetadataParam, LinkProfileBankAccountsByRemoteIdResponse200, LinkProfileBankAccountsByRemoteIdResponse400, LinkProfileBankAccountsByRemoteIdResponse401, LinkProfileBankAccountsByRemoteIdResponse403, LinkProfileBankAccountsByRemoteIdResponse404, LinkProfileBankAccountsByRemoteIdResponse500, LinkProfileBankAccountsMetadataParam, LinkProfileBankAccountsResponse200, LinkProfileBankAccountsResponse400, LinkProfileBankAccountsResponse401, LinkProfileBankAccountsResponse403, LinkProfileBankAccountsResponse404, LinkProfileBankAccountsResponse500, LinkSupplierBankAccountsBodyParam, LinkSupplierBankAccountsByRemoteIdBodyParam, LinkSupplierBankAccountsByRemoteIdMetadataParam, LinkSupplierBankAccountsByRemoteIdResponse200, LinkSupplierBankAccountsByRemoteIdResponse400, LinkSupplierBankAccountsByRemoteIdResponse401, LinkSupplierBankAccountsByRemoteIdResponse403, LinkSupplierBankAccountsByRemoteIdResponse404, LinkSupplierBankAccountsByRemoteIdResponse500, LinkSupplierBankAccountsMetadataParam, LinkSupplierBankAccountsResponse200, LinkSupplierBankAccountsResponse400, LinkSupplierBankAccountsResponse401, LinkSupplierBankAccountsResponse403, LinkSupplierBankAccountsResponse404, LinkSupplierBankAccountsResponse500, ListProfileBankAccountsByRemoteIdMetadataParam, ListProfileBankAccountsByRemoteIdResponse200, ListProfileBankAccountsByRemoteIdResponse400, ListProfileBankAccountsByRemoteIdResponse401, ListProfileBankAccountsByRemoteIdResponse403, ListProfileBankAccountsByRemoteIdResponse404, ListProfileBankAccountsByRemoteIdResponse500, ListProfileBankAccountsMetadataParam, ListProfileBankAccountsResponse200, ListProfileBankAccountsResponse400, ListProfileBankAccountsResponse401, ListProfileBankAccountsResponse403, ListProfileBankAccountsResponse404, ListProfileBankAccountsResponse500, ListSupplierBankAccountsByRemoteIdMetadataParam, ListSupplierBankAccountsByRemoteIdResponse200, ListSupplierBankAccountsByRemoteIdResponse400, ListSupplierBankAccountsByRemoteIdResponse401, ListSupplierBankAccountsByRemoteIdResponse403, ListSupplierBankAccountsByRemoteIdResponse404, ListSupplierBankAccountsByRemoteIdResponse500, ListSupplierBankAccountsMetadataParam, ListSupplierBankAccountsResponse200, ListSupplierBankAccountsResponse400, ListSupplierBankAccountsResponse401, ListSupplierBankAccountsResponse403, ListSupplierBankAccountsResponse404, ListSupplierBankAccountsResponse500, UnlinkProfileBankAccountByRemoteIdMetadataParam, UnlinkProfileBankAccountByRemoteIdResponse400, UnlinkProfileBankAccountByRemoteIdResponse401, UnlinkProfileBankAccountByRemoteIdResponse403, UnlinkProfileBankAccountByRemoteIdResponse404, UnlinkProfileBankAccountByRemoteIdResponse500, UnlinkProfileBankAccountMetadataParam, UnlinkProfileBankAccountResponse400, UnlinkProfileBankAccountResponse401, UnlinkProfileBankAccountResponse403, UnlinkProfileBankAccountResponse404, UnlinkProfileBankAccountResponse500, UnlinkSupplierBankAccountByRemoteIdMetadataParam, UnlinkSupplierBankAccountByRemoteIdResponse400, UnlinkSupplierBankAccountByRemoteIdResponse401, UnlinkSupplierBankAccountByRemoteIdResponse403, UnlinkSupplierBankAccountByRemoteIdResponse404, UnlinkSupplierBankAccountByRemoteIdResponse500, UnlinkSupplierBankAccountMetadataParam, UnlinkSupplierBankAccountResponse400, UnlinkSupplierBankAccountResponse401, UnlinkSupplierBankAccountResponse403, UnlinkSupplierBankAccountResponse404, UnlinkSupplierBankAccountResponse500, UpdateAddressBodyParam, UpdateAddressByRemoteIdBodyParam, UpdateAddressByRemoteIdMetadataParam, UpdateAddressByRemoteIdResponse200, UpdateAddressByRemoteIdResponse400, UpdateAddressByRemoteIdResponse401, UpdateAddressByRemoteIdResponse403, UpdateAddressByRemoteIdResponse404, UpdateAddressByRemoteIdResponse500, UpdateAddressMetadataParam, UpdateAddressResponse200, UpdateAddressResponse400, UpdateAddressResponse401, UpdateAddressResponse403, UpdateAddressResponse404, UpdateAddressResponse500, UpdateBankAccountByIdBodyParam, UpdateBankAccountByIdMetadataParam, UpdateBankAccountByIdResponse200, UpdateBankAccountByIdResponse400, UpdateBankAccountByIdResponse401, UpdateBankAccountByIdResponse403, UpdateBankAccountByIdResponse404, UpdateBankAccountByIdResponse500, UpdateBankAccountByRemoteIdBodyParam, UpdateBankAccountByRemoteIdMetadataParam, UpdateBankAccountByRemoteIdResponse200, UpdateBankAccountByRemoteIdResponse400, UpdateBankAccountByRemoteIdResponse401, UpdateBankAccountByRemoteIdResponse403, UpdateBankAccountByRemoteIdResponse404, UpdateBankAccountByRemoteIdResponse500, UpdateCurrencyByIdBodyParam, UpdateCurrencyByIdMetadataParam, UpdateCurrencyByIdResponse200, UpdateCurrencyByIdResponse400, UpdateCurrencyByIdResponse401, UpdateCurrencyByIdResponse403, UpdateCurrencyByIdResponse404, UpdateCurrencyByIdResponse500, UpdateCurrencyByRemoteIdBodyParam, UpdateCurrencyByRemoteIdMetadataParam, UpdateCurrencyByRemoteIdResponse200, UpdateCurrencyByRemoteIdResponse400, UpdateCurrencyByRemoteIdResponse401, UpdateCurrencyByRemoteIdResponse403, UpdateCurrencyByRemoteIdResponse404, UpdateCurrencyByRemoteIdResponse500, UpdateCustomDataRecordByIdBodyParam, UpdateCustomDataRecordByIdMetadataParam, UpdateCustomDataRecordByIdResponse200, UpdateCustomDataRecordByIdResponse400, UpdateCustomDataRecordByIdResponse401, UpdateCustomDataRecordByIdResponse403, UpdateCustomDataRecordByIdResponse404, UpdateCustomDataRecordByIdResponse500, UpdateCustomDataRecordByRemoteIdBodyParam, UpdateCustomDataRecordByRemoteIdMetadataParam, UpdateCustomDataRecordByRemoteIdResponse200, UpdateCustomDataRecordByRemoteIdResponse400, UpdateCustomDataRecordByRemoteIdResponse401, UpdateCustomDataRecordByRemoteIdResponse403, UpdateCustomDataRecordByRemoteIdResponse404, UpdateCustomDataRecordByRemoteIdResponse500, UpdateDepartmentByIdBodyParam, UpdateDepartmentByIdMetadataParam, UpdateDepartmentByIdResponse200, UpdateDepartmentByIdResponse400, UpdateDepartmentByIdResponse401, UpdateDepartmentByIdResponse403, UpdateDepartmentByIdResponse404, UpdateDepartmentByIdResponse500, UpdateDepartmentByRemoteIdBodyParam, UpdateDepartmentByRemoteIdMetadataParam, UpdateDepartmentByRemoteIdResponse200, UpdateDepartmentByRemoteIdResponse400, UpdateDepartmentByRemoteIdResponse401, UpdateDepartmentByRemoteIdResponse403, UpdateDepartmentByRemoteIdResponse404, UpdateDepartmentByRemoteIdResponse500, UpdateExternalContactByIdBodyParam, UpdateExternalContactByIdMetadataParam, UpdateExternalContactByIdResponse200, UpdateExternalContactByIdResponse400, UpdateExternalContactByIdResponse401, UpdateExternalContactByIdResponse403, UpdateExternalContactByIdResponse404, UpdateExternalContactByIdResponse409, UpdateExternalContactByIdResponse500, UpdateExternalContactByRemoteIdBodyParam, UpdateExternalContactByRemoteIdMetadataParam, UpdateExternalContactByRemoteIdResponse200, UpdateExternalContactByRemoteIdResponse400, UpdateExternalContactByRemoteIdResponse401, UpdateExternalContactByRemoteIdResponse403, UpdateExternalContactByRemoteIdResponse404, UpdateExternalContactByRemoteIdResponse409, UpdateExternalContactByRemoteIdResponse500, UpdateInternalContactByIdBodyParam, UpdateInternalContactByIdMetadataParam, UpdateInternalContactByIdResponse200, UpdateInternalContactByIdResponse400, UpdateInternalContactByIdResponse401, UpdateInternalContactByIdResponse403, UpdateInternalContactByIdResponse404, UpdateInternalContactByIdResponse409, UpdateInternalContactByIdResponse500, UpdateInternalContactByRemoteIdBodyParam, UpdateInternalContactByRemoteIdMetadataParam, UpdateInternalContactByRemoteIdResponse200, UpdateInternalContactByRemoteIdResponse400, UpdateInternalContactByRemoteIdResponse401, UpdateInternalContactByRemoteIdResponse403, UpdateInternalContactByRemoteIdResponse404, UpdateInternalContactByRemoteIdResponse409, UpdateInternalContactByRemoteIdResponse500, UpdateLineItemTypeByIdBodyParam, UpdateLineItemTypeByIdMetadataParam, UpdateLineItemTypeByIdResponse200, UpdateLineItemTypeByIdResponse400, UpdateLineItemTypeByIdResponse401, UpdateLineItemTypeByIdResponse403, UpdateLineItemTypeByIdResponse404, UpdateLineItemTypeByIdResponse500, UpdateLineItemTypeByRemoteIdBodyParam, UpdateLineItemTypeByRemoteIdMetadataParam, UpdateLineItemTypeByRemoteIdResponse200, UpdateLineItemTypeByRemoteIdResponse400, UpdateLineItemTypeByRemoteIdResponse401, UpdateLineItemTypeByRemoteIdResponse403, UpdateLineItemTypeByRemoteIdResponse404, UpdateLineItemTypeByRemoteIdResponse500, UpdatePaymentMethodBodyParam, UpdatePaymentMethodByRemoteIdBodyParam, UpdatePaymentMethodByRemoteIdMetadataParam, UpdatePaymentMethodByRemoteIdResponse200, UpdatePaymentMethodByRemoteIdResponse400, UpdatePaymentMethodByRemoteIdResponse401, UpdatePaymentMethodByRemoteIdResponse403, UpdatePaymentMethodByRemoteIdResponse404, UpdatePaymentMethodByRemoteIdResponse500, UpdatePaymentMethodMetadataParam, UpdatePaymentMethodResponse200, UpdatePaymentMethodResponse400, UpdatePaymentMethodResponse401, UpdatePaymentMethodResponse403, UpdatePaymentMethodResponse500, UpdatePaymentTermByIdBodyParam, UpdatePaymentTermByIdMetadataParam, UpdatePaymentTermByIdResponse200, UpdatePaymentTermByIdResponse400, UpdatePaymentTermByIdResponse401, UpdatePaymentTermByIdResponse403, UpdatePaymentTermByIdResponse404, UpdatePaymentTermByIdResponse500, UpdatePaymentTermByRemoteIdBodyParam, UpdatePaymentTermByRemoteIdMetadataParam, UpdatePaymentTermByRemoteIdResponse200, UpdatePaymentTermByRemoteIdResponse400, UpdatePaymentTermByRemoteIdResponse401, UpdatePaymentTermByRemoteIdResponse403, UpdatePaymentTermByRemoteIdResponse404, UpdatePaymentTermByRemoteIdResponse500, UpdatePurchaseOrderBodyParam, UpdatePurchaseOrderByIdBodyParam, UpdatePurchaseOrderByIdMetadataParam, UpdatePurchaseOrderByIdResponse200, UpdatePurchaseOrderByIdResponse400, UpdatePurchaseOrderByIdResponse401, UpdatePurchaseOrderByIdResponse403, UpdatePurchaseOrderByIdResponse404, UpdatePurchaseOrderByIdResponse500, UpdatePurchaseOrderByRemoteIdBodyParam, UpdatePurchaseOrderByRemoteIdMetadataParam, UpdatePurchaseOrderByRemoteIdResponse200, UpdatePurchaseOrderByRemoteIdResponse400, UpdatePurchaseOrderByRemoteIdResponse401, UpdatePurchaseOrderByRemoteIdResponse403, UpdatePurchaseOrderByRemoteIdResponse404, UpdatePurchaseOrderByRemoteIdResponse500, UpdatePurchaseOrderLineItemByIdBodyParam, UpdatePurchaseOrderLineItemByIdMetadataParam, UpdatePurchaseOrderLineItemByIdResponse200, UpdatePurchaseOrderLineItemByIdResponse400, UpdatePurchaseOrderLineItemByIdResponse401, UpdatePurchaseOrderLineItemByIdResponse403, UpdatePurchaseOrderLineItemByIdResponse404, UpdatePurchaseOrderLineItemByIdResponse500, UpdatePurchaseOrderLineItemByRemoteIdBodyParam, UpdatePurchaseOrderLineItemByRemoteIdMetadataParam, UpdatePurchaseOrderLineItemByRemoteIdResponse200, UpdatePurchaseOrderLineItemByRemoteIdResponse400, UpdatePurchaseOrderLineItemByRemoteIdResponse401, UpdatePurchaseOrderLineItemByRemoteIdResponse403, UpdatePurchaseOrderLineItemByRemoteIdResponse404, UpdatePurchaseOrderLineItemByRemoteIdResponse500, UpdatePurchaseOrderMetadataParam, UpdatePurchaseOrderResponse200, UpdatePurchaseOrderResponse400, UpdatePurchaseOrderResponse401, UpdatePurchaseOrderResponse403, UpdatePurchaseOrderResponse404, UpdatePurchaseOrderResponse500, UpdateSubsidiaryByIdBodyParam, UpdateSubsidiaryByIdMetadataParam, UpdateSubsidiaryByIdResponse200, UpdateSubsidiaryByIdResponse400, UpdateSubsidiaryByIdResponse401, UpdateSubsidiaryByIdResponse403, UpdateSubsidiaryByIdResponse404, UpdateSubsidiaryByIdResponse500, UpdateSubsidiaryByRemoteIdBodyParam, UpdateSubsidiaryByRemoteIdMetadataParam, UpdateSubsidiaryByRemoteIdResponse200, UpdateSubsidiaryByRemoteIdResponse400, UpdateSubsidiaryByRemoteIdResponse401, UpdateSubsidiaryByRemoteIdResponse403, UpdateSubsidiaryByRemoteIdResponse404, UpdateSubsidiaryByRemoteIdResponse500, UpdateSupplierBodyParam, UpdateSupplierByRemoteIdBodyParam, UpdateSupplierByRemoteIdMetadataParam, UpdateSupplierByRemoteIdResponse200, UpdateSupplierByRemoteIdResponse400, UpdateSupplierByRemoteIdResponse401, UpdateSupplierByRemoteIdResponse403, UpdateSupplierByRemoteIdResponse404, UpdateSupplierByRemoteIdResponse500, UpdateSupplierMetadataParam, UpdateSupplierProfileBySubsidiaryIdBodyParam, UpdateSupplierProfileBySubsidiaryIdMetadataParam, UpdateSupplierProfileBySubsidiaryIdResponse200, UpdateSupplierProfileBySubsidiaryIdResponse400, UpdateSupplierProfileBySubsidiaryIdResponse401, UpdateSupplierProfileBySubsidiaryIdResponse403, UpdateSupplierProfileBySubsidiaryIdResponse404, UpdateSupplierProfileBySubsidiaryIdResponse500, UpdateSupplierProfileBySubsidiaryRemoteIdBodyParam, UpdateSupplierProfileBySubsidiaryRemoteIdMetadataParam, UpdateSupplierProfileBySubsidiaryRemoteIdResponse200, UpdateSupplierProfileBySubsidiaryRemoteIdResponse400, UpdateSupplierProfileBySubsidiaryRemoteIdResponse401, UpdateSupplierProfileBySubsidiaryRemoteIdResponse403, UpdateSupplierProfileBySubsidiaryRemoteIdResponse404, UpdateSupplierProfileBySubsidiaryRemoteIdResponse500, UpdateSupplierResponse200, UpdateSupplierResponse400, UpdateSupplierResponse401, UpdateSupplierResponse403, UpdateSupplierResponse404, UpdateSupplierResponse500, UpdateSuppliersBodyParam, UpdateSuppliersByRemoteIdBodyParam, UpdateSuppliersByRemoteIdResponse200, UpdateSuppliersByRemoteIdResponse400, UpdateSuppliersByRemoteIdResponse401, UpdateSuppliersByRemoteIdResponse403, UpdateSuppliersByRemoteIdResponse404, UpdateSuppliersByRemoteIdResponse500, UpdateSuppliersResponse200, UpdateSuppliersResponse400, UpdateSuppliersResponse401, UpdateSuppliersResponse403, UpdateSuppliersResponse404, UpdateSuppliersResponse500, UpdateUsersBodyParam, UpdateUsersResponse200, UpdateUsersResponse400, UpdateUsersResponse401, UpdateUsersResponse403, UpdateUsersResponse404, UpdateUsersResponse500 } from './types';
