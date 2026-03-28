<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Http\Exceptions\HttpResponseException;

class ApplySyncMappingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Body root-level array olarak geldiğinde ($request->all() boş olabilir)
     * JSON content'i doğrudan kullan
     */
    public function validationData(): array
    {
        $data = $this->all();
        if (empty($data) && str_contains((string) $this->header('Content-Type'), 'application/json')) {
            $json = $this->json()->all();
            return is_array($json) ? $json : [];
        }
        return is_array($data) ? $data : [];
    }

    public function rules(): array
    {
        return [
            '*' => 'array',
            '*.sku' => 'required|string',
            '*.archived_from_sync' => 'sometimes|boolean',
            '*.shopify_product_id' => 'nullable|string',
            '*.shopify_variant_id' => 'nullable|string',
            '*.shopify_inventory_item_id' => 'nullable|string',
            '*.shopify_location_id' => 'nullable|string',
        ];
    }

    /**
     * Body array olarak geldiği için JSON response döndür
     */
    protected function failedValidation(Validator $validator)
    {
        throw new HttpResponseException(
            response()->json([
                'success' => false,
                'error' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422)
        );
    }
}
