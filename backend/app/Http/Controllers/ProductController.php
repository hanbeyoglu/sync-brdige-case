<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProductInventory;
use App\Models\ProductPriceTier;
use Illuminate\Http\Request;
use Illuminate\View\View;

class ProductController extends Controller
{
    private const TIER_TAGS = ['wholesale', 'retail', 'vip'];

    /**
     * UI'nin desteklediği tag listesine göre fiyat katmanlarını replace eder.
     * Not: DB unique kuralı (product_id, customer_tag, min_quantity) olduğu için
     * min_quantity değişince eski satırı yenisiyle "update" etmek yerine tag bazlı sil+ekle yapılır.
     */
    private function persistPriceTiers(Product $product, array $priceTiers): void
    {
        ProductPriceTier::where('product_id', $product->id)
            ->whereIn('customer_tag', self::TIER_TAGS)
            ->delete();

        foreach (self::TIER_TAGS as $tag) {
            $tierInput = $priceTiers[$tag] ?? null;
            if (!is_array($tierInput)) {
                continue;
            }

            $price = $tierInput['price'] ?? null;
            $minQuantity = $tierInput['min_quantity'] ?? null;

            $hasPrice = !($price === null || $price === '');
            $hasMinQuantity = !($minQuantity === null || $minQuantity === '');
            if (!$hasPrice || !$hasMinQuantity) {
                continue; // tam dolmamış tier'ı kaydetme
            }

            ProductPriceTier::create([
                'product_id' => $product->id,
                'customer_tag' => $tag,
                'price' => $price,
                'min_quantity' => $minQuantity,
            ]);
        }
    }

    public function index(): View
    {
        $products = Product::with(['inventory', 'priceTiers'])->orderBy('sku')->paginate(15);
        return view('products.index', compact('products'));
    }

    public function create(): View
    {
        return view('products.create');
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'sku' => 'required|string|unique:products,sku',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'base_price' => 'required|numeric|min:0',
            'in_shopify' => ['required', 'boolean'],
            'quantity' => 'integer|min:0',
            'price_tiers' => 'nullable|array',
            'price_tiers.*.price' => ['nullable', 'numeric', 'min:0', 'regex:/^\\d+(\\.\\d{1,2})?$/'],
            'price_tiers.*.min_quantity' => 'nullable|integer|min:1',
        ]);

        $priceTiers = $validated['price_tiers'] ?? [];
        unset($validated['price_tiers']);

        $product = Product::create([
            'sku' => $validated['sku'],
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'base_price' => $validated['base_price'],
            'in_shopify' => (bool) $request->input('in_shopify'),
        ]);

        if (isset($validated['quantity']) && $validated['quantity'] > 0) {
            ProductInventory::create([
                'product_id' => $product->id,
                'quantity' => $validated['quantity'],
                'location' => 'default',
            ]);
        }

        $this->persistPriceTiers($product, $priceTiers);

        return redirect()->route('products.index')->with('success', 'Ürün oluşturuldu.');
    }

    public function show(Product $product): View
    {
        $product->load(['inventory', 'priceTiers']);
        return view('products.show', compact('product'));
    }

    public function edit(Product $product): View
    {
        $product->load(['inventory', 'priceTiers']);
        return view('products.edit', compact('product'));
    }

    public function update(Request $request, Product $product)
    {
        $validated = $request->validate([
            'sku' => 'required|string|unique:products,sku,' . $product->id,
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'base_price' => 'required|numeric|min:0',
            'in_shopify' => ['required', 'boolean'],
            'price_tiers' => 'nullable|array',
            'price_tiers.*.price' => ['nullable', 'numeric', 'min:0', 'regex:/^\\d+(\\.\\d{1,2})?$/'],
            'price_tiers.*.min_quantity' => 'nullable|integer|min:1',
        ]);

        $priceTiers = $validated['price_tiers'] ?? [];
        unset($validated['price_tiers']);

        $validated['in_shopify'] = (bool) $request->input('in_shopify');

        $product->update($validated);

        if ($request->has('quantity')) {
            $inv = $product->inventory()->first();
            if ($inv) {
                $inv->update(['quantity' => (int) $request->quantity]);
            } else {
                ProductInventory::create([
                    'product_id' => $product->id,
                    'quantity' => (int) $request->quantity,
                    'location' => 'default',
                ]);
            }
        }

        if ($request->has('price_tiers')) {
            $this->persistPriceTiers($product, $priceTiers);
        }

        return redirect()->route('products.index')->with('success', 'Ürün güncellendi.');
    }

    public function destroy(Product $product)
    {
        $product->delete();
        return redirect()->route('products.index')->with('success', 'Ürün silindi.');
    }
}
