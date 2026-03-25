<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProductInventory;
use App\Models\ProductPriceTier;
use Illuminate\Http\Request;
use Illuminate\View\View;

class ProductController extends Controller
{
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
        ]);

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
        ]);

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

        return redirect()->route('products.index')->with('success', 'Ürün güncellendi.');
    }

    public function destroy(Product $product)
    {
        $product->delete();
        return redirect()->route('products.index')->with('success', 'Ürün silindi.');
    }
}
