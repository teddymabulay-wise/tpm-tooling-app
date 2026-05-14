export type SisInsideEnvironment = "staging" | "staging-it" | "production" | "custom";

export type SisInsideHeader = {
  key: string;
  value: string;
  disabled?: boolean;
};

export type SisInsideBody =
  | { mode: "raw"; raw: string }
  | { mode: "urlencoded"; urlencoded: Array<{ key: string; value: string; type: string; disabled?: boolean }> }
  | { mode: string };

export type SisInsideCaptureVariable = {
  key: string;
  responsePath: string[];
};

export type SisInsideEndpoint = {
  id: string;
  name: string;
  method: string;
  path: string;
  topLevelCollection: string;
  groupPath: string[];
  description: string;
  authType: string;
  headers: SisInsideHeader[];
  body?: SisInsideBody;
  variableKeys: string[];
  captureVariables: SisInsideCaptureVariable[];
  testScript: string;
};

export const sisInsideEnvironmentPresets: Record<Exclude<SisInsideEnvironment, "custom">, { label: string; baseUrl: string }> = {
  "staging": {
    "label": "Staging",
    "baseUrl": "https://api.eu-west-a.apiconnect.ibmappdomain.cloud/sis-id-com/my-sis-id-staging"
  },
  "staging-it": {
    "label": "Staging IT",
    "baseUrl": "https://api.eu-west-a.apiconnect.ibmappdomain.cloud/sis-id-com/my-sis-id-staging-it"
  },
  "production": {
    "label": "Production",
    "baseUrl": "https://api.sis-inside.com/my"
  }
};

export const sisInsideEndpoints: SisInsideEndpoint[] = [
  {
    "id": "oauth-token-get-get-token-basic-auth",
    "name": "Get Token Basic Auth",
    "method": "POST",
    "path": "{{url}}/api/v1/authentication/oauth2/token",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Token",
      "Get"
    ],
    "description": "Postman path: OAuth / Token / Get",
    "authType": "basic",
    "headers": [],
    "body": {
      "mode": "urlencoded",
      "urlencoded": [
        {
          "key": "grant_type",
          "value": "client_credentials",
          "type": "text",
          "disabled": false
        },
        {
          "key": "scope",
          "value": "api",
          "type": "text",
          "disabled": false
        }
      ]
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    //postman.setEnvironmentVariable(\"token\", responseJson.access_token);\n    pm.collectionVariables.set(\"access-token\", responseJson.access_token);\n}"
  },
  {
    "id": "oauth-token-get-get-token-client-id-client-secret",
    "name": "Get Token Client Id / Client Secret",
    "method": "POST",
    "path": "{{url}}/api/v1/authentication/oauth2/token",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Token",
      "Get"
    ],
    "description": "Postman path: OAuth / Token / Get",
    "authType": "noauth",
    "headers": [
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": false
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": false
      }
    ],
    "body": {
      "mode": "urlencoded",
      "urlencoded": [
        {
          "key": "grant_type",
          "value": "client_credentials",
          "type": "text",
          "disabled": false
        },
        {
          "key": "scope",
          "value": "api",
          "type": "text",
          "disabled": false
        }
      ]
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    //postman.setEnvironmentVariable(\"token\", responseJson.access_token);\n    pm.collectionVariables.set(\"access-token\", responseJson.access_token);\n}"
  },
  {
    "id": "oauth-controls-unitary-download-b2b-download-pdf",
    "name": "B2B - Download PDF",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/{{controlId}}/download",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary",
      "Download"
    ],
    "description": "Postman path: OAuth / Controls / Unitary / Download",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": true
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "controlId"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-controls-unitary-download-get-result",
    "name": "Get Result",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/{{controlId}}",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary",
      "Download"
    ],
    "description": "Postman path: OAuth / Controls / Unitary / Download",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": true
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "controlId"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-controls-unitary-b2b-default",
    "name": "B2B - Default",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"FR\",\n      \"registrationId\": \"824003958\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7610096185050007770500256\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-fastrack-async",
    "name": "Fastrack Async",
    "method": "POST",
    "path": "{{url}}/sis-id/async-checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"FR\",\n      \"registrationId\": \"824003958\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7610096185050007770500256\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-name",
    "name": "B2B - Name",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"FR\",\n      \"name\": \"SIS\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7630004002740001011876858\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-typeid-deprecated",
    "name": "B2B - TypeID [Deprecated]",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"FR\",\n      \"name\": \"SIS\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7630004002740001011876858\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-bban-routing",
    "name": "B2B - BBAN ROUTING",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"JP\",\n      \"registrationId\": \"2120001045542\"\n    },\n    \"paymentIdentity\": {\n      \"countryCode\": \"JP\",\n      \"bban\": \"0202109\",\n      \"routingCode\": \"SBIN0007054\"\n\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-bban-routing-us",
    "name": "B2B - BBAN ROUTING US",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"US\",\n      \"registrationId\": \"465234686\"\n    },\n    \"paymentIdentity\": {\n      \"countryCode\": \"US\",\n      \"bban\": \"222333444555\",\n      \"routingCode\": \"026009593\",\n      \"bic\" : \"PMFAUS66HKG\"\n\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-bban-routing-us-advanced-search",
    "name": "B2B - BBAN ROUTING US Advanced Search",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"US\",\n      \"registrationId\": \"465234686\"\n      \"name\" : \"Million Dollar Company\",\n      \"address\": {\n                \"postalCode\": \"01999\",\n                \"streetAddress\": \"Pastrami Street\",\n                \"city\": \"23E4R5T6Y7U89\"\n            },\n    },\n    \"paymentIdentity\": {\n      \"countryCode\": \"US\",\n      \"bban\": \"222333444555\",\n      \"routingCode\": \"026009593\",\n      \"bic\" : \"PMFAUS66HKG\"\n\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-bban-bic",
    "name": "B2B - BBAN BIC",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"JP\",\n      \"registrationId\": \"2120001045542\"\n    },\n    \"paymentIdentity\": {\n      \"countryCode\": \"JP\",\n      \"bban\": \"0202109\",\n      \"bic\": \"SBIN0007054\"\n\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-b2b-it",
    "name": "B2B - IT",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"IT\",\n      \"registrationId\": \"IT13279060969\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"IT30E0503433324000000034862\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-natural-fullname",
    "name": "Natural Fullname",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"physicalPersonIdentifier\": {\n      \"fullName\": \"Jean Michel Cheval\",\n      \"birthdate\": \"1839-01-19\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7630004000031234567890143\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-natural",
    "name": "Natural",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"physicalPersonIdentifier\": {\n      \"firstName\": \"Paul\",\n      \"lastName\": \"Cézanne\",\n      \"birthdate\": \"1839-01-19\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7630004000031234567890143\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-unitary-natural-new",
    "name": "Natural New",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: OAuth / Controls / Unitary",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "en",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"physicalPersonIdentifier\": {\n      \"firstName\": \"Paul\",\n      \"lastName\": \"Cézanne\",\n      \"birthdate\": \"1839-01-19\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR7630004000031234567890143\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "oauth-controls-batch-create-b2b-batch-controls-small",
    "name": "B2B - Batch Controls Small",
    "method": "PUT",
    "path": "{{url}}/sis-id/audition/imports",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Batch",
      "Create"
    ],
    "description": "Postman path: OAuth / Controls / Batch / Create",
    "authType": "bearer",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"name\": \"Batch#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n    \"audits\": [\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"3128199424\",\n                \"countryCode\": \"KR\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"140008109847\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"SHBKKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"7018700647\",\n                \"typeId\": \"32\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"91480101956655\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"CZNBKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"typeId\": \"4\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 00017\",\n                \"typeId\": \"5\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"04366849\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"00425892\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"813975695\",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR7611978000010279471104064\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"0433384716\",\n                \"countryCode\": \"BE\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"BE75435412150151\"\n            }\n        }\n    ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret",
      "$randomAlphaNumeric"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"controlsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "oauth-controls-batch-create-b2b-batch-controls-small-copy",
    "name": "B2B - Batch Controls Small Copy",
    "method": "PUT",
    "path": "{{url}}/sis-id/audition/imports",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Batch",
      "Create"
    ],
    "description": "Postman path: OAuth / Controls / Batch / Create",
    "authType": "bearer",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"name\": \"Batch#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n    \"audits\": [\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"3128199424\",\n                \"countryCode\": \"KR\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"140008109847\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"SHBKKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"7018700647\",\n                \"typeId\": \"32\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"91480101956655\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"CZNBKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"typeId\": \"4\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 00017\",\n                \"typeId\": \"5\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"04366849\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"00425892\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"813975695\",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR7611978000010279471104064\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"0433384716\",\n                \"countryCode\": \"BE\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"BE75435412150151\"\n            }\n        }\n    ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret",
      "$randomAlphaNumeric"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"controlsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "oauth-controls-batch-status-b2b-batch-controls-status",
    "name": "B2B - Batch Controls Status",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/imports/:id",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Batch",
      "Status"
    ],
    "description": "Postman path: OAuth / Controls / Batch / Status",
    "authType": "bearer",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-controls-batch-results-b2b-batch-controls-results",
    "name": "B2B - Batch Controls Results",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/imports/:id/controls?size=10",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Controls",
      "Batch",
      "Results"
    ],
    "description": "Postman path: OAuth / Controls / Batch / Results",
    "authType": "bearer",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-invitations-create-invitation-create-fr",
    "name": "Invitation - Create FR",
    "method": "POST",
    "path": "{{url}}/sis-id/invitations/code",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Invitations",
      "Create"
    ],
    "description": "Postman path: OAuth / Invitations / Create",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"company\": {\n        \"countryCode\": \"FR\",\n        \"companyId\": \"798962106\"\n    }\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 201) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"invitationCode\", responseJson.code);\n}"
  },
  {
    "id": "oauth-invitations-send-invitation-send",
    "name": "Invitation - Send",
    "method": "POST",
    "path": "{{url}}/sis-id/invitations/:code/send",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Invitations",
      "Send"
    ],
    "description": "Postman path: OAuth / Invitations / Send",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"sender\": {\n        \"firstName\": \"Gaston\",\n        \"lastName\": \"Lagaffe\",\n        \"email\": \"gaston.lagaffe@sis-id.com\"\n    },\n    \"recipients\": [\n        {\n            \"firstName\": \"Jeanne\",\n            \"lastName\": \"Mademoiselle\",\n            \"email\": \"mademoiselle.jeanne@sis-id.com\",\n            \"mobile\": \"\",\n            \"locale\":\"fr\",\n            \"reference\": \"Ref###\"\n        }\n    ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-invitations-status-invitation-code-status",
    "name": "Invitation Code Status",
    "method": "GET",
    "path": "{{url}}/sis-id/invitations/:code/status",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Invitations",
      "Status"
    ],
    "description": "Postman path: OAuth / Invitations / Status",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-invitations-history-invitation-code-history",
    "name": "Invitation Code History",
    "method": "GET",
    "path": "{{url}}/sis-id/invitations/:code/history",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Invitations",
      "History"
    ],
    "description": "Postman path: OAuth / Invitations / History",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-invitations-list-invitation-codes-list",
    "name": "Invitation Codes List",
    "method": "GET",
    "path": "{{url}}/sis-id/invitations?page=16",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Invitations",
      "List"
    ],
    "description": "Postman path: OAuth / Invitations / List",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-invitations-revoke-invitation-revoke",
    "name": "Invitation - Revoke",
    "method": "PUT",
    "path": "{{url}}/sis-id/invitations/:code/revoke",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Invitations",
      "Revoke"
    ],
    "description": "Postman path: OAuth / Invitations / Revoke",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-payments-get-bic",
    "name": "Get BIC",
    "method": "GET",
    "path": "{{url}}/sis-id/payments/iban/:iban/bic",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Payments"
    ],
    "description": "Postman path: OAuth / Payments",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-payments-get-bic-details",
    "name": "Get BIC Details",
    "method": "GET",
    "path": "{{url}}/sis-id/payments/bics/:bic",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Payments"
    ],
    "description": "Postman path: OAuth / Payments",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-histories-create-transactions-batch",
    "name": "Transactions Batch",
    "method": "PUT",
    "path": "{{url}}/sis-id/history/transactions/batch",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Histories",
      "Create"
    ],
    "description": "Postman path: OAuth / Histories / Create",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"transactions\" : [ {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400002001924081\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"383894052\",\n      \"name\" : \"BANQUE PALATINE\",\n      \"address\" : {\n        \"addressee\" : \"BANQUE PALATINE\",\n        \"streetAddress\" : \"42 RUE D'ANJOU\",\n        \"postalCode\" : \"75382\",\n        \"city\" : \"PARIS 08\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7640978000221277047050589\",\n      \"bic\" : \"BSPFFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400002001924081\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"DE\",\n      \"ein\" : \"DE811366863\",\n      \"name\" : \"ZDF ENTERPRISES GMBH\",\n      \"address\" : {\n        \"addressee\" : \"ZDF ENTERPRISES GMBH\",\n        \"streetAddress\" : \"ERICH-DOMBROWSKI-STR. 1\",\n        \"postalCode\" : \"55127\",\n        \"city\" : \"MAINZ\",\n        \"country\" : \"DE\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"DE\",\n      \"iban\" : \"DE21550400220200144400\",\n      \"bic\" : \"COBADEFFXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400382002056079\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"GB\",\n      \"ein\" : \"GB524439057\",\n      \"name\" : \"BRITISH SCREEN FINANCE LIMITED\",\n      \"address\" : {\n        \"addressee\" : \"BRITISH SCREEN FINANCE LIMITED\",\n        \"streetAddress\" : \"10 LITTLE PORTLAND STREET\",\n        \"postalCode\" : \"W1W 7JG\",\n        \"city\" : \"LONDON\",\n        \"country\" : \"GB\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"GB\",\n      \"iban\" : \"GB79LOYD30000803091378\",\n      \"bic\" : \"LOYDGB21012\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400382002056079\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"GB\",\n      \"name\" : \"FREEWAY CAM (UK) LIMITED\",\n      \"address\" : {\n        \"addressee\" : \"FREEWAY CAM (UK) LIMITED\",\n        \"streetAddress\" : \"C/O TMF GROUP\",\n        \"postalCode\" : \"EC4A 4AB\",\n        \"city\" : \"LONDON\",\n        \"country\" : \"GB\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"GB\",\n      \"bic\" : \"COUTGB22XXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"343134763\",\n      \"name\" : \"VIVENDI\",\n      \"address\" : {\n        \"addressee\" : \"VIVENDI\",\n        \"streetAddress\" : \"42 AVENU DE FRIEDLAND\",\n        \"postalCode\" : \"75008\",\n        \"city\" : \"PARIS 08\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003031750002026257977\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"352855993\",\n      \"name\" : \"POLYCONSEIL\",\n      \"address\" : {\n        \"addressee\" : \"POLYCONSEIL\",\n        \"streetAddress\" : \"2 RUE ROUGEMONT\",\n        \"postalCode\" : \"75009\",\n        \"city\" : \"PARIS 09\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630066109720002023920129\",\n      \"bic\" : \"CMCIFRPPCOR\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"552088536\",\n      \"name\" : \"BOLLORE LOGISTICS\",\n      \"address\" : {\n        \"addressee\" : \"BOLLORE LOGISTICS\",\n        \"streetAddress\" : \"31 QUAI DE DION BOUTON\",\n        \"postalCode\" : \"92800\",\n        \"city\" : \"PUTEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630066109720001011000151\",\n      \"bic\" : \"CMCIFRPPCOR\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 10\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"403201767\",\n      \"name\" : \"HAVAS MEDIA FRANCE\",\n      \"address\" : {\n        \"addressee\" : \"HAVAS MEDIA FRANCE\",\n        \"streetAddress\" : \"2 RUE GODEFROY, BIS\",\n        \"postalCode\" : \"92800\",\n        \"city\" : \"PUTEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7611899001240002592834559\",\n      \"bic\" : \"CMCIFR2A\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 10\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"349208447\",\n      \"name\" : \"HAVAS PARIS\",\n      \"address\" : {\n        \"addressee\" : \"HAVAS PARIS\",\n        \"streetAddress\" : \"29 QUAI DE DION BOUTON\",\n        \"postalCode\" : \"92800\",\n        \"city\" : \"PUTEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004021460001038035674\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"509512760\",\n      \"name\" : \"EKINO\",\n      \"address\" : {\n        \"addressee\" : \"EKINO\",\n        \"streetAddress\" : \"157 RUE ANATOLE FRANCE\",\n        \"postalCode\" : \"92300\",\n        \"city\" : \"LEVALLOIS PERRET\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004013280001234936604\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400302021189624\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"BE\",\n      \"ein\" : \"BE0437664097\",\n      \"name\" : \"UNITRON\",\n      \"address\" : {\n        \"addressee\" : \"UNITRON\",\n        \"streetAddress\" : \"FRANKRIJKLAAN 27\",\n        \"postalCode\" : \"8970\",\n        \"city\" : \"POPERINGE\",\n        \"country\" : \"BE\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"BE\",\n      \"iban\" : \"BE17363149426621\",\n      \"bic\" : \"BBRUBEBBXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"CH\",\n      \"duns\" : \"486037448\",\n      \"name\" : \"IWEDIA SA\",\n      \"address\" : {\n        \"addressee\" : \"IWEDIA SA\",\n        \"streetAddress\" : \"ROUTE DE CHAVANNES 9 9\",\n        \"postalCode\" : \"1007\",\n        \"city\" : \"LAUSANNE\",\n        \"country\" : \"CH\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"CH\",\n      \"iban\" : \"CH780024324311057860K\",\n      \"bic\" : \"UBSWCHZH80A\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"US\",\n      \"duns\" : \"023746231\",\n      \"name\" : \"UNIVERSAL CINERGIA DUBBING LLC\",\n      \"address\" : {\n        \"addressee\" : \"UNIVERSAL CINERGIA DUBBING LLC\",\n        \"streetAddress\" : \"106 1315 NW 98TH CT UNIT 8\",\n        \"postalCode\" : \"33172-2774\",\n        \"city\" : \"DORAL\",\n        \"country\" : \"US\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"US\",\n      \"bic\" : \"UPNBUS44\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"453557746\",\n      \"name\" : \"ERICSSON BROADCAST SERVICES FRANCE\",\n      \"address\" : {\n        \"addressee\" : \"ERICSSON BROADCAST SERVICES FRANCE\",\n        \"streetAddress\" : \"23 RUE DU DOME\",\n        \"postalCode\" : \"92100\",\n        \"city\" : \"BOULOGNE BILLANCOURT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004013280001311586004\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 5\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"499956092\",\n      \"name\" : \"LEAKID\",\n      \"address\" : {\n        \"addressee\" : \"LEAKID\",\n        \"streetAddress\" : \"52 RUE VOLTAIRE\",\n        \"postalCode\" : \"92250\",\n        \"city\" : \"LA GARENNE COLOMBES\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004000640001007243796\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"512836263\",\n      \"name\" : \"PIXAGILITY\",\n      \"address\" : {\n        \"addressee\" : \"PIXAGILITY\",\n        \"streetAddress\" : \"88 AVENU DU GENERAL LECLERC\",\n        \"postalCode\" : \"92100\",\n        \"city\" : \"BOULOGNE BILLANCOURT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003042400002095004041\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 18\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400302021189624\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"841119431\",\n      \"name\" : \"SMARDTV GLOBAL SAS\",\n      \"address\" : {\n        \"addressee\" : \"SMARDTV GLOBAL SAS\",\n        \"streetAddress\" : \"147 AVENU DU JUJUBIER\",\n        \"postalCode\" : \"13600\",\n        \"city\" : \"LA CIOTAT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003012690007801664433\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 14\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400302021189624\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"HK\",\n      \"name\" : \"SYMEA LIMITED\",\n      \"address\" : {\n        \"addressee\" : \"SYMEA LIMITED\",\n        \"streetAddress\" : \"RM 7B 7/F CAPITAL COML BLDG\",\n        \"city\" : \"MONGKOK\",\n        \"country\" : \"HK\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"HK\",\n      \"bic\" : \"HSBCHKHHHKH\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"BE\",\n      \"ein\" : \"BE0896755397\",\n      \"name\" : \"PRODUCTIONS ASSOCIEES\",\n      \"address\" : {\n        \"addressee\" : \"PRODUCTIONS ASSOCIEES\",\n        \"streetAddress\" : \"RUE COENRAETS 72\",\n        \"postalCode\" : \"1060\",\n        \"city\" : \"BRUXELLES\",\n        \"country\" : \"BE\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"BE\",\n      \"iban\" : \"BE62068900871561\",\n      \"bic\" : \"GKCCBEBBXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"ES\",\n      \"ein\" : \"ESB56019912\",\n      \"name\" : \"GENIALLY WEB SL.\",\n      \"address\" : {\n        \"addressee\" : \"GENIALLY WEB SL.\",\n        \"streetAddress\" : \"PLAZA DE RAMON Y CAJAL, 4 - 4 4 4\",\n        \"postalCode\" : \"14003\",\n        \"city\" : \"CORDOBA\",\n        \"country\" : \"ES\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"ES\",\n      \"iban\" : \"ES3600190481104010049200\",\n      \"bic\" : \"DEUTESBBXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"IT\",\n      \"ein\" : \"IT10219030151\",\n      \"name\" : \"MILAN ENTERTAINMNENT SRL\",\n      \"address\" : {\n        \"addressee\" : \"MILAN ENTERTAINMNENT SRL\",\n        \"streetAddress\" : \"VIA ALDO ROSSI 8\",\n        \"postalCode\" : \"20149\",\n        \"city\" : \"MILANO\",\n        \"country\" : \"IT\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"IT\",\n      \"iban\" : \"IT29V0503401699000000001334\",\n      \"bic\" : \"BAPPIT22XXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"402433155\",\n      \"name\" : \"COGNACQ JAY IMAGE\",\n      \"address\" : {\n        \"addressee\" : \"COGNACQ JAY IMAGE\",\n        \"streetAddress\" : \"3 ESP DU FONCET\",\n        \"postalCode\" : \"92130\",\n        \"city\" : \"ISSY LES MOULINEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR5630002056690000230594X77\",\n      \"bic\" : \"CRLYFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"379292600\",\n      \"name\" : \"IMAGINE EDITIONS MOINS QUE DEMAIN\",\n      \"address\" : {\n        \"addressee\" : \"IMAGINE EDITIONS MOINS QUE DEMAIN\",\n        \"streetAddress\" : \"3 RUE HOCHE\",\n        \"postalCode\" : \"92130\",\n        \"city\" : \"ISSY LES MOULINEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630066109120001007090108\",\n      \"bic\" : \"CMCIFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"484936885\",\n      \"name\" : \"SAOSIGN STUDIOS\",\n      \"address\" : {\n        \"addressee\" : \"SAOSIGN STUDIOS\",\n        \"streetAddress\" : \"21 CHEMI DES SABLES\",\n        \"postalCode\" : \"78120\",\n        \"city\" : \"CLAIREFONTAINE EN YVELINES\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004008340001021134286\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"409255585\",\n      \"name\" : \"2 EXVIA\",\n      \"address\" : {\n        \"addressee\" : \"2 EXVIA\",\n        \"streetAddress\" : \"28 RUE DU GENERAL DE GAULLE\",\n        \"postalCode\" : \"67205\",\n        \"city\" : \"OBERHAUSBERGEN\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7615135090170876979232927\",\n      \"bic\" : \"CEPAFRPP513\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"353403074\",\n      \"name\" : \"FORMALEX MEDIALEX\",\n      \"address\" : {\n        \"addressee\" : \"FORMALEX MEDIALEX\",\n        \"streetAddress\" : \"10 RUE DU BREIL\",\n        \"postalCode\" : \"35000\",\n        \"city\" : \"RENNES\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7618829354150116676434418\",\n      \"bic\" : \"CMBRFR2BCME\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"523164424\",\n      \"name\" : \"VDM SAS\",\n      \"address\" : {\n        \"addressee\" : \"VDM SAS\",\n        \"streetAddress\" : \"135 RUE JEAN JACQUES ROUSSEAU\",\n        \"postalCode\" : \"92130\",\n        \"city\" : \"ISSY LES MOULINEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630788001000891278000103\",\n      \"bic\" : \"NSMBFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 6\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"418827655\",\n      \"name\" : \"CONSORT FRANCE\",\n      \"address\" : {\n        \"addressee\" : \"CONSORT FRANCE\",\n        \"streetAddress\" : \"58 BOULE GOUVION ST CYR\",\n        \"postalCode\" : \"75017\",\n        \"city\" : \"PARIS 17\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR0920041000016964306D02021\",\n      \"bic\" : \"PSSTFRPPPAR\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"524100179\",\n      \"name\" : \"MJM POST PROD\",\n      \"address\" : {\n        \"addressee\" : \"MJM POST PROD\",\n        \"streetAddress\" : \"13 RUE DE VANVES\",\n        \"postalCode\" : \"92100\",\n        \"city\" : \"BOULOGNE BILLANCOURT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR9430002006650000431243P21\",\n      \"bic\" : \"CRLYFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 8\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"529505273\",\n      \"name\" : \"NEXTON CONSULTING\",\n      \"address\" : {\n        \"addressee\" : \"NEXTON CONSULTING\",\n        \"streetAddress\" : \"5 RUE SAINT FIACRE\",\n        \"postalCode\" : \"75002\",\n        \"city\" : \"PARIS 02\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003033920002033388005\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 3\n  } ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 201) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"historyTransactionsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "oauth-histories-status-transactions-batch-status",
    "name": "Transactions Batch Status",
    "method": "GET",
    "path": "{{url}}/sis-id/history/transactions/batch/:id",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Histories",
      "Status"
    ],
    "description": "Postman path: OAuth / Histories / Status",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json; charset=utf-8",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "oauth-histories-csv-create-csv-upload",
    "name": "CSV Upload",
    "method": "POST",
    "path": "{{url}}/sis-id/history/v1/upload",
    "topLevelCollection": "OAuth",
    "groupPath": [
      "Histories",
      "CSV Create"
    ],
    "description": "Postman path: OAuth / Histories / CSV Create",
    "authType": "bearer",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": true
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "formdata"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"historyTransactionsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "basic-auth-controls-unitary-download-b2b-download-pdf",
    "name": "B2B - Download PDF",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/{{controlId}}/download",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Controls",
      "Unitary",
      "Download"
    ],
    "description": "Postman path: Basic Auth / Controls / Unitary / Download",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": true
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "controlId"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-controls-unitary-b2b-fr",
    "name": "B2B - FR",
    "method": "POST",
    "path": "{{url}}/sis-id/checks",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Controls",
      "Unitary"
    ],
    "description": "Postman path: Basic Auth / Controls / Unitary",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"entity\": {\n    \"company\": {\n      \"countryCode\": \"FR\",\n      \"registrationId\": \"824003958\"\n    },\n    \"paymentIdentity\": {\n      \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n    }\n  }\n}"
    },
    "variableKeys": [
      "url"
    ],
    "captureVariables": [
      {
        "key": "controlId",
        "responsePath": [
          "id"
        ]
      }
    ],
    "testScript": "pm.test(\"Status code should be 201\", () => {\n    pm.collectionVariables.set(\"controlId\", pm.response.json().id);\n  pm.response.to.have.status(201);\n});\npm.test(\"Content-Type header should be application/json\", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/json');\n});\npm.test(\"Response property classification should be 'HIGH'\", function () {\n  pm.expect(pm.response.json().classification).to.eql(\"HIGH\");\n});"
  },
  {
    "id": "basic-auth-controls-batch-create-b2b-batch-controls-small",
    "name": "B2B - Batch Controls Small",
    "method": "PUT",
    "path": "{{url}}/sis-id/audition/imports",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Controls",
      "Batch",
      "Create"
    ],
    "description": "Postman path: Basic Auth / Controls / Batch / Create",
    "authType": "basic",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"name\": \"Batch#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n    \"audits\": [\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"3128199424\",\n                \"countryCode\": \"KR\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"140008109847\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"SHBKKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"7018700647\",\n                \"typeId\": \"32\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"91480101956655\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"CZNBKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"typeId\": \"4\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 00017\",\n                \"typeId\": \"5\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"04366849\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"00425892\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"813975695\",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR7611978000010279471104064\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"0433384716\",\n                \"countryCode\": \"BE\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"BE75435412150151\"\n            }\n        }\n    ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret",
      "$randomAlphaNumeric"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"controlsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "basic-auth-controls-batch-create-b2b-batch-controls-small-copy",
    "name": "B2B - Batch Controls Small Copy",
    "method": "PUT",
    "path": "{{url}}/sis-id/audition/imports",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Controls",
      "Batch",
      "Create"
    ],
    "description": "Postman path: Basic Auth / Controls / Batch / Create",
    "authType": "basic",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"name\": \"Batch#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n    \"audits\": [\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"3128199424\",\n                \"countryCode\": \"KR\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"140008109847\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"SHBKKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"7018700647\",\n                \"typeId\": \"32\"\n            },\n            \"paymentIdentity\": {\n                \"bban\": \"91480101956655\",\n                \"countryCode\": \"KR\",\n                \"bic\": \"CZNBKRSE\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 \",\n                \"typeId\": \"4\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"824 003 958 00017\",\n                \"typeId\": \"5\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR76 1009 6185 0500 0777 0500 256\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"04366849\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"00425892\",\n                \"countryCode\": \"GB\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"GB04MIDL40051571478822\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"813975695\",\n                \"countryCode\": \"FR\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"FR7611978000010279471104064\"\n            }\n        },\n        {\n            \"reference\": \"Payment#{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}{{$randomAlphaNumeric}}\",\n            \"company\": {\n                \"registrationId\": \"0433384716\",\n                \"countryCode\": \"BE\"\n            },\n            \"paymentIdentity\": {\n                \"iban\": \"BE75435412150151\"\n            }\n        }\n    ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret",
      "$randomAlphaNumeric"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"controlsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "basic-auth-controls-batch-status-b2b-batch-controls-status",
    "name": "B2B - Batch Controls Status",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/imports/:id",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Controls",
      "Batch",
      "Status"
    ],
    "description": "Postman path: Basic Auth / Controls / Batch / Status",
    "authType": "basic",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-controls-batch-results-b2b-batch-controls-results",
    "name": "B2B - Batch Controls Results",
    "method": "GET",
    "path": "{{url}}/sis-id/audition/imports/:id/controls?size=10",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Controls",
      "Batch",
      "Results"
    ],
    "description": "Postman path: Basic Auth / Controls / Batch / Results",
    "authType": "basic",
    "headers": [
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-invitations-create-invitation-create-fr",
    "name": "Invitation - Create FR",
    "method": "POST",
    "path": "{{url}}/sis-id/invitations/code",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Invitations",
      "Create"
    ],
    "description": "Postman path: Basic Auth / Invitations / Create",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"company\": {\n        \"countryCode\": \"FR\",\n        \"companyId\": \"798962106\"\n    }\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 201) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"invitationCode\", responseJson.code);\n}"
  },
  {
    "id": "basic-auth-invitations-send-invitation-send",
    "name": "Invitation - Send",
    "method": "POST",
    "path": "{{url}}/sis-id/invitations/:code/send",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Invitations",
      "Send"
    ],
    "description": "Postman path: Basic Auth / Invitations / Send",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n    \"sender\": {\n        \"firstName\": \"Gaston\",\n        \"lastName\": \"Lagaffe\",\n        \"email\": \"gaston.lagaffe@sis-id.com\"\n    },\n    \"recipients\": [\n        {\n            \"firstName\": \"Jeanne\",\n            \"lastName\": \"Mademoiselle\",\n            \"email\": \"mademoiselle.jeanne@sis-id.com\",\n            \"mobile\": \"\",\n            \"locale\":\"fr\",\n            \"reference\": \"Ref###\"\n        }\n    ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-invitations-status-invitation-code-status",
    "name": "Invitation Code Status",
    "method": "GET",
    "path": "{{url}}/sis-id/invitations/:code/status",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Invitations",
      "Status"
    ],
    "description": "Postman path: Basic Auth / Invitations / Status",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-invitations-history-invitation-code-history",
    "name": "Invitation Code History",
    "method": "GET",
    "path": "{{url}}/sis-id/invitations/:code/history",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Invitations",
      "History"
    ],
    "description": "Postman path: Basic Auth / Invitations / History",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-invitations-list-invitation-codes-list",
    "name": "Invitation Codes List",
    "method": "GET",
    "path": "{{url}}/sis-id/invitations?page=16&size=10",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Invitations",
      "List"
    ],
    "description": "Postman path: Basic Auth / Invitations / List",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-invitations-revoke-invitation-revoke",
    "name": "Invitation - Revoke",
    "method": "PUT",
    "path": "{{url}}/sis-id/invitations/:code/revoke",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Invitations",
      "Revoke"
    ],
    "description": "Postman path: Basic Auth / Invitations / Revoke",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-payments-get-bic",
    "name": "Get BIC",
    "method": "GET",
    "path": "{{url}}/sis-id/payments/iban/:iban/bic",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Payments"
    ],
    "description": "Postman path: Basic Auth / Payments",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-payments-get-bic-details",
    "name": "Get BIC Details",
    "method": "GET",
    "path": "{{url}}/sis-id/payments/bics/:bic",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Payments"
    ],
    "description": "Postman path: Basic Auth / Payments",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-histories-create-transactions-batch",
    "name": "Transactions Batch",
    "method": "PUT",
    "path": "{{url}}/sis-id/history/transactions/batch",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Histories",
      "Create"
    ],
    "description": "Postman path: Basic Auth / Histories / Create",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "raw",
      "raw": "{\n  \"transactions\" : [ {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400002001924081\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"383894052\",\n      \"name\" : \"BANQUE PALATINE\",\n      \"address\" : {\n        \"addressee\" : \"BANQUE PALATINE\",\n        \"streetAddress\" : \"42 RUE D'ANJOU\",\n        \"postalCode\" : \"75382\",\n        \"city\" : \"PARIS 08\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7640978000221277047050589\",\n      \"bic\" : \"BSPFFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400002001924081\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"DE\",\n      \"ein\" : \"DE811366863\",\n      \"name\" : \"ZDF ENTERPRISES GMBH\",\n      \"address\" : {\n        \"addressee\" : \"ZDF ENTERPRISES GMBH\",\n        \"streetAddress\" : \"ERICH-DOMBROWSKI-STR. 1\",\n        \"postalCode\" : \"55127\",\n        \"city\" : \"MAINZ\",\n        \"country\" : \"DE\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"DE\",\n      \"iban\" : \"DE21550400220200144400\",\n      \"bic\" : \"COBADEFFXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400382002056079\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"GB\",\n      \"ein\" : \"GB524439057\",\n      \"name\" : \"BRITISH SCREEN FINANCE LIMITED\",\n      \"address\" : {\n        \"addressee\" : \"BRITISH SCREEN FINANCE LIMITED\",\n        \"streetAddress\" : \"10 LITTLE PORTLAND STREET\",\n        \"postalCode\" : \"W1W 7JG\",\n        \"city\" : \"LONDON\",\n        \"country\" : \"GB\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"GB\",\n      \"iban\" : \"GB79LOYD30000803091378\",\n      \"bic\" : \"LOYDGB21012\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400382002056079\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"GB\",\n      \"name\" : \"FREEWAY CAM (UK) LIMITED\",\n      \"address\" : {\n        \"addressee\" : \"FREEWAY CAM (UK) LIMITED\",\n        \"streetAddress\" : \"C/O TMF GROUP\",\n        \"postalCode\" : \"EC4A 4AB\",\n        \"city\" : \"LONDON\",\n        \"country\" : \"GB\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"GB\",\n      \"bic\" : \"COUTGB22XXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"343134763\",\n      \"name\" : \"VIVENDI\",\n      \"address\" : {\n        \"addressee\" : \"VIVENDI\",\n        \"streetAddress\" : \"42 AVENU DE FRIEDLAND\",\n        \"postalCode\" : \"75008\",\n        \"city\" : \"PARIS 08\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003031750002026257977\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"352855993\",\n      \"name\" : \"POLYCONSEIL\",\n      \"address\" : {\n        \"addressee\" : \"POLYCONSEIL\",\n        \"streetAddress\" : \"2 RUE ROUGEMONT\",\n        \"postalCode\" : \"75009\",\n        \"city\" : \"PARIS 09\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630066109720002023920129\",\n      \"bic\" : \"CMCIFRPPCOR\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"552088536\",\n      \"name\" : \"BOLLORE LOGISTICS\",\n      \"address\" : {\n        \"addressee\" : \"BOLLORE LOGISTICS\",\n        \"streetAddress\" : \"31 QUAI DE DION BOUTON\",\n        \"postalCode\" : \"92800\",\n        \"city\" : \"PUTEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630066109720001011000151\",\n      \"bic\" : \"CMCIFRPPCOR\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 10\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"403201767\",\n      \"name\" : \"HAVAS MEDIA FRANCE\",\n      \"address\" : {\n        \"addressee\" : \"HAVAS MEDIA FRANCE\",\n        \"streetAddress\" : \"2 RUE GODEFROY, BIS\",\n        \"postalCode\" : \"92800\",\n        \"city\" : \"PUTEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7611899001240002592834559\",\n      \"bic\" : \"CMCIFR2A\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 10\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"349208447\",\n      \"name\" : \"HAVAS PARIS\",\n      \"address\" : {\n        \"addressee\" : \"HAVAS PARIS\",\n        \"streetAddress\" : \"29 QUAI DE DION BOUTON\",\n        \"postalCode\" : \"92800\",\n        \"city\" : \"PUTEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004021460001038035674\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"509512760\",\n      \"name\" : \"EKINO\",\n      \"address\" : {\n        \"addressee\" : \"EKINO\",\n        \"streetAddress\" : \"157 RUE ANATOLE FRANCE\",\n        \"postalCode\" : \"92300\",\n        \"city\" : \"LEVALLOIS PERRET\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004013280001234936604\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400302021189624\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"BE\",\n      \"ein\" : \"BE0437664097\",\n      \"name\" : \"UNITRON\",\n      \"address\" : {\n        \"addressee\" : \"UNITRON\",\n        \"streetAddress\" : \"FRANKRIJKLAAN 27\",\n        \"postalCode\" : \"8970\",\n        \"city\" : \"POPERINGE\",\n        \"country\" : \"BE\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"BE\",\n      \"iban\" : \"BE17363149426621\",\n      \"bic\" : \"BBRUBEBBXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"CH\",\n      \"duns\" : \"486037448\",\n      \"name\" : \"IWEDIA SA\",\n      \"address\" : {\n        \"addressee\" : \"IWEDIA SA\",\n        \"streetAddress\" : \"ROUTE DE CHAVANNES 9 9\",\n        \"postalCode\" : \"1007\",\n        \"city\" : \"LAUSANNE\",\n        \"country\" : \"CH\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"CH\",\n      \"iban\" : \"CH780024324311057860K\",\n      \"bic\" : \"UBSWCHZH80A\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"US\",\n      \"duns\" : \"023746231\",\n      \"name\" : \"UNIVERSAL CINERGIA DUBBING LLC\",\n      \"address\" : {\n        \"addressee\" : \"UNIVERSAL CINERGIA DUBBING LLC\",\n        \"streetAddress\" : \"106 1315 NW 98TH CT UNIT 8\",\n        \"postalCode\" : \"33172-2774\",\n        \"city\" : \"DORAL\",\n        \"country\" : \"US\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"US\",\n      \"bic\" : \"UPNBUS44\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"453557746\",\n      \"name\" : \"ERICSSON BROADCAST SERVICES FRANCE\",\n      \"address\" : {\n        \"addressee\" : \"ERICSSON BROADCAST SERVICES FRANCE\",\n        \"streetAddress\" : \"23 RUE DU DOME\",\n        \"postalCode\" : \"92100\",\n        \"city\" : \"BOULOGNE BILLANCOURT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004013280001311586004\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 5\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"499956092\",\n      \"name\" : \"LEAKID\",\n      \"address\" : {\n        \"addressee\" : \"LEAKID\",\n        \"streetAddress\" : \"52 RUE VOLTAIRE\",\n        \"postalCode\" : \"92250\",\n        \"city\" : \"LA GARENNE COLOMBES\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004000640001007243796\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"512836263\",\n      \"name\" : \"PIXAGILITY\",\n      \"address\" : {\n        \"addressee\" : \"PIXAGILITY\",\n        \"streetAddress\" : \"88 AVENU DU GENERAL LECLERC\",\n        \"postalCode\" : \"92100\",\n        \"city\" : \"BOULOGNE BILLANCOURT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003042400002095004041\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 18\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400302021189624\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"841119431\",\n      \"name\" : \"SMARDTV GLOBAL SAS\",\n      \"address\" : {\n        \"addressee\" : \"SMARDTV GLOBAL SAS\",\n        \"streetAddress\" : \"147 AVENU DU JUJUBIER\",\n        \"postalCode\" : \"13600\",\n        \"city\" : \"LA CIOTAT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003012690007801664433\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 14\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400302021189624\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"HK\",\n      \"name\" : \"SYMEA LIMITED\",\n      \"address\" : {\n        \"addressee\" : \"SYMEA LIMITED\",\n        \"streetAddress\" : \"RM 7B 7/F CAPITAL COML BLDG\",\n        \"city\" : \"MONGKOK\",\n        \"country\" : \"HK\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"HK\",\n      \"bic\" : \"HSBCHKHHHKH\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"BE\",\n      \"ein\" : \"BE0896755397\",\n      \"name\" : \"PRODUCTIONS ASSOCIEES\",\n      \"address\" : {\n        \"addressee\" : \"PRODUCTIONS ASSOCIEES\",\n        \"streetAddress\" : \"RUE COENRAETS 72\",\n        \"postalCode\" : \"1060\",\n        \"city\" : \"BRUXELLES\",\n        \"country\" : \"BE\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"BE\",\n      \"iban\" : \"BE62068900871561\",\n      \"bic\" : \"GKCCBEBBXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"ES\",\n      \"ein\" : \"ESB56019912\",\n      \"name\" : \"GENIALLY WEB SL.\",\n      \"address\" : {\n        \"addressee\" : \"GENIALLY WEB SL.\",\n        \"streetAddress\" : \"PLAZA DE RAMON Y CAJAL, 4 - 4 4 4\",\n        \"postalCode\" : \"14003\",\n        \"city\" : \"CORDOBA\",\n        \"country\" : \"ES\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"ES\",\n      \"iban\" : \"ES3600190481104010049200\",\n      \"bic\" : \"DEUTESBBXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"IT\",\n      \"ein\" : \"IT10219030151\",\n      \"name\" : \"MILAN ENTERTAINMNENT SRL\",\n      \"address\" : {\n        \"addressee\" : \"MILAN ENTERTAINMNENT SRL\",\n        \"streetAddress\" : \"VIA ALDO ROSSI 8\",\n        \"postalCode\" : \"20149\",\n        \"city\" : \"MILANO\",\n        \"country\" : \"IT\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"IT\",\n      \"iban\" : \"IT29V0503401699000000001334\",\n      \"bic\" : \"BAPPIT22XXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"402433155\",\n      \"name\" : \"COGNACQ JAY IMAGE\",\n      \"address\" : {\n        \"addressee\" : \"COGNACQ JAY IMAGE\",\n        \"streetAddress\" : \"3 ESP DU FONCET\",\n        \"postalCode\" : \"92130\",\n        \"city\" : \"ISSY LES MOULINEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR5630002056690000230594X77\",\n      \"bic\" : \"CRLYFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"379292600\",\n      \"name\" : \"IMAGINE EDITIONS MOINS QUE DEMAIN\",\n      \"address\" : {\n        \"addressee\" : \"IMAGINE EDITIONS MOINS QUE DEMAIN\",\n        \"streetAddress\" : \"3 RUE HOCHE\",\n        \"postalCode\" : \"92130\",\n        \"city\" : \"ISSY LES MOULINEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630066109120001007090108\",\n      \"bic\" : \"CMCIFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"484936885\",\n      \"name\" : \"SAOSIGN STUDIOS\",\n      \"address\" : {\n        \"addressee\" : \"SAOSIGN STUDIOS\",\n        \"streetAddress\" : \"21 CHEMI DES SABLES\",\n        \"postalCode\" : \"78120\",\n        \"city\" : \"CLAIREFONTAINE EN YVELINES\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630004008340001021134286\",\n      \"bic\" : \"BNPAFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"409255585\",\n      \"name\" : \"2 EXVIA\",\n      \"address\" : {\n        \"addressee\" : \"2 EXVIA\",\n        \"streetAddress\" : \"28 RUE DU GENERAL DE GAULLE\",\n        \"postalCode\" : \"67205\",\n        \"city\" : \"OBERHAUSBERGEN\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7615135090170876979232927\",\n      \"bic\" : \"CEPAFRPP513\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 2\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"353403074\",\n      \"name\" : \"FORMALEX MEDIALEX\",\n      \"address\" : {\n        \"addressee\" : \"FORMALEX MEDIALEX\",\n        \"streetAddress\" : \"10 RUE DU BREIL\",\n        \"postalCode\" : \"35000\",\n        \"city\" : \"RENNES\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7618829354150116676434418\",\n      \"bic\" : \"CMBRFR2BCME\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"523164424\",\n      \"name\" : \"VDM SAS\",\n      \"address\" : {\n        \"addressee\" : \"VDM SAS\",\n        \"streetAddress\" : \"135 RUE JEAN JACQUES ROUSSEAU\",\n        \"postalCode\" : \"92130\",\n        \"city\" : \"ISSY LES MOULINEAUX\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630788001000891278000103\",\n      \"bic\" : \"NSMBFRPPXXX\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 6\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"418827655\",\n      \"name\" : \"CONSORT FRANCE\",\n      \"address\" : {\n        \"addressee\" : \"CONSORT FRANCE\",\n        \"streetAddress\" : \"58 BOULE GOUVION ST CYR\",\n        \"postalCode\" : \"75017\",\n        \"city\" : \"PARIS 17\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR0920041000016964306D02021\",\n      \"bic\" : \"PSSTFRPPPAR\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 1\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"524100179\",\n      \"name\" : \"MJM POST PROD\",\n      \"address\" : {\n        \"addressee\" : \"MJM POST PROD\",\n        \"streetAddress\" : \"13 RUE DE VANVES\",\n        \"postalCode\" : \"92100\",\n        \"city\" : \"BOULOGNE BILLANCOURT\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR9430002006650000431243P21\",\n      \"bic\" : \"CRLYFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 8\n  }, {\n    \"transmitterCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"82400395800017\",\n      \"euVAT\" : \"FR60824003958\",\n      \"name\" : \"SIS\",\n      \"address\" : {\n        \"addressee\" : \"SIS\",\n        \"addresseeDescription\" : \"\",\n        \"streetAddress\" : \"20 BOULEVARD EUGÈNE DERUELLE\",\n        \"additionalAddress\" : \"LE BRITANNIA - ALLÉE B - ETAGE 8\",\n        \"postalCode\" : \"69003\",\n        \"city\" : \"LYON\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"transmitterPaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003036400012021189687\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"payeeCompany\" : {\n      \"country\" : \"FR\",\n      \"ein\" : \"529505273\",\n      \"name\" : \"NEXTON CONSULTING\",\n      \"address\" : {\n        \"addressee\" : \"NEXTON CONSULTING\",\n        \"streetAddress\" : \"5 RUE SAINT FIACRE\",\n        \"postalCode\" : \"75002\",\n        \"city\" : \"PARIS 02\",\n        \"country\" : \"FR\"\n      }\n    },\n    \"payeePaymentIdentity\" : {\n      \"country\" : \"FR\",\n      \"iban\" : \"FR7630003033920002033388005\",\n      \"bic\" : \"SOGEFRPP\"\n    },\n    \"date\" : \"2022-01-03T00:00:00Z\",\n    \"count\" : 3\n  } ]\n}"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 201) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"historyTransactionsBatchId\", responseJson.id);\n}"
  },
  {
    "id": "basic-auth-histories-status-transactions-batch-status",
    "name": "Transactions Batch Status",
    "method": "GET",
    "path": "{{url}}/sis-id/history/transactions/batch/:id",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Histories",
      "Status"
    ],
    "description": "Postman path: Basic Auth / Histories / Status",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json;charset=UTF-8",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json; charset=utf-8",
        "disabled": false
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "Accept-Language",
        "value": "fr",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": ""
  },
  {
    "id": "basic-auth-histories-csv-create-csv-upload",
    "name": "CSV Upload",
    "method": "POST",
    "path": "{{url}}/sis-id/history/v1/upload",
    "topLevelCollection": "Basic Auth",
    "groupPath": [
      "Histories",
      "CSV Create"
    ],
    "description": "Postman path: Basic Auth / Histories / CSV Create",
    "authType": "basic",
    "headers": [
      {
        "key": "Accept",
        "value": "application/json",
        "disabled": false
      },
      {
        "key": "Content-Type",
        "value": "application/json",
        "disabled": true
      },
      {
        "key": "x-ibm-client-id",
        "value": "{{clientId}}",
        "disabled": true
      },
      {
        "key": "x-ibm-client-secret",
        "value": "{{clientSecret}}",
        "disabled": true
      },
      {
        "key": "APIm-Debug",
        "value": "true",
        "disabled": false
      }
    ],
    "body": {
      "mode": "formdata"
    },
    "variableKeys": [
      "url",
      "clientId",
      "clientSecret"
    ],
    "captureVariables": [],
    "testScript": "if (pm.response.code == 200) {\n    const responseJson = pm.response.json();\n    pm.collectionVariables.set(\"historyTransactionsBatchId\", responseJson.id);\n}"
  }
];
