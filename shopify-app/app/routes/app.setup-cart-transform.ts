import { authenticate } from "../shopify.server";

const LIST_CART_TRANSFORMS = `
  query ListCartTransforms {
    cartTransforms(first: 25) {
      nodes {
        id
        functionId
      }
    }
  }
`;

const CREATE_CART_TRANSFORM = `
  mutation CreateCartTransform($functionId: String!) {
    cartTransformCreate(functionId: $functionId) {
      cartTransform {
        id
        functionId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const APP_INSTALLATION_SCOPES = `
  query AppInstallationScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    // eslint-disable-next-line no-undef
    const functionId = process.env.B2B_CART_TRANSFORM_FUNCTION_ID || "";

    if (!functionId) {
      return Response.json(
        {
          ok: false,
          error:
            "B2B_CART_TRANSFORM_FUNCTION_ID eksik. Önce cart-transform function ID'sini .env içine ekleyin.",
        },
        { status: 400 },
      );
    }

    const scopeRes = await admin.graphql(APP_INSTALLATION_SCOPES);
    const scopeJson = await scopeRes.json();
    const grantedScopes =
      scopeJson?.data?.currentAppInstallation?.accessScopes?.map(
        (s) => s?.handle,
      ) ?? [];
    const hasCartTransformScopes =
      grantedScopes.includes("read_cart_transforms") &&
      grantedScopes.includes("write_cart_transforms");

    if (!hasCartTransformScopes) {
      return Response.json(
        {
          ok: false,
          error:
            "App installation scope'larında read_cart_transforms/write_cart_transforms yok.",
          grantedScopes,
          envScopes:
            // eslint-disable-next-line no-undef
            (process.env.SCOPES || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          hint:
            "App'i uninstall + reinstall yapın (scope değişikliği eski token'a işlemez).",
        },
        { status: 403 },
      );
    }

    const listRes = await admin.graphql(LIST_CART_TRANSFORMS);
    const listJson = await listRes.json();
    const existing =
      listJson?.data?.cartTransforms?.nodes?.find(
        (node) => node?.functionId === functionId,
      ) || null;

    if (existing) {
      return Response.json({
        ok: true,
        alreadyExists: true,
        cartTransform: existing,
        userErrors: [],
      });
    }

    const createRes = await admin.graphql(CREATE_CART_TRANSFORM, {
      variables: { functionId },
    });
    const createJson = await createRes.json();

    const payload = createJson?.data?.cartTransformCreate;
    return Response.json({
      ok: (payload?.userErrors?.length ?? 0) === 0,
      alreadyExists: false,
      cartTransform: payload?.cartTransform ?? null,
      userErrors: payload?.userErrors ?? [],
      errors: createJson?.errors ?? [],
    });
  } catch (error) {
    const graphQLErrors = error?.body?.errors?.graphQLErrors ?? [];
    const message =
      graphQLErrors?.[0]?.message ||
      error?.body?.errors?.message ||
      error?.message ||
      "Cart transform setup sırasında beklenmeyen hata.";

    return Response.json(
      {
        ok: false,
        error: message,
        graphQLErrors,
        rawError: String(error),
        hint:
          "Muhtemel neden: scope eksik/yenilenmedi (read_cart_transforms, write_cart_transforms) veya function ID bu app'e ait değil.",
      },
      { status: 500 },
    );
  }
}
