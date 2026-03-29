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

export async function loader({ request }) {
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
}
