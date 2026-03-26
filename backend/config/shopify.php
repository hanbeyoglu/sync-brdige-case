<?php

return [
    'webhook_secret' => env('SHOPIFY_WEBHOOK_SECRET', ''),
    'api_key' => env('SHOPIFY_API_KEY', ''),
    'api_secret' => env('SHOPIFY_API_SECRET', ''),
    'api_secret_for_app' => env('API_SECRET_KEY', ''),
];
