import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    mutation {
      discountAutomaticAppCreate(
        automaticAppDiscount: {
          title: "B2B Pricing"
          functionId: "gid://shopify/ShopifyFunction/019d3534-0f4e-72c8-822c-896c444f9371"
          startsAt: "2026-01-01T00:00:00Z"
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
  `);

  return Response.json(await response.json());
}
