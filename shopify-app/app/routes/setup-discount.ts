import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  const functionId = process.env.B2B_PRICING_FUNCTION_ID || "";
  if (!functionId) {
    return Response.json(
      {
        ok: false,
        error:
          "B2B_PRICING_FUNCTION_ID env değişkeni eksik. Önce deploy edilen pricing function ID'sini ekleyin.",
      },
      { status: 400 },
    );
  }

  const startsAt = new Date().toISOString();
  const response = await admin.graphql(`
    mutation CreateB2bPricingDiscount($functionId: String!, $startsAt: DateTime!) {
      discountAutomaticAppCreate(
        automaticAppDiscount: {
          title: "B2B Pricing"
          functionId: $functionId
          startsAt: $startsAt
        }
      ) {
        automaticAppDiscount {
          discountId
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    variables: {
      functionId,
      startsAt,
    },
  });

  return Response.json(await response.json());
}
