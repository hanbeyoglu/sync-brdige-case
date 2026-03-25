@extends('layouts.app')

@section('title', 'Ürün Düzenle')

@section('content')
<div class="bg-white rounded-lg shadow p-6 max-w-2xl">
    <h1 class="text-2xl font-bold mb-6">Ürün Düzenle: {{ $product->sku }}</h1>
    <form method="POST" action="{{ route('products.update', $product) }}">
        @csrf
        @method('PUT')
        <div class="space-y-4">
            <div>
                <label class="block text-gray-700 mb-1">SKU *</label>
                <input type="text" name="sku" value="{{ old('sku', $product->sku) }}" required
                    class="w-full px-4 py-2 border rounded @error('sku') border-red-500 @enderror">
                @error('sku')<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Ürün Adı *</label>
                <input type="text" name="name" value="{{ old('name', $product->name) }}" required
                    class="w-full px-4 py-2 border rounded @error('name') border-red-500 @enderror">
                @error('name')<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Açıklama</label>
                <textarea name="description" rows="3" class="w-full px-4 py-2 border rounded">{{ old('description', $product->description) }}</textarea>
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Taban Fiyat ($) *</label>
                <input type="number" step="0.01" name="base_price" value="{{ old('base_price', $product->base_price) }}" required
                    class="w-full px-4 py-2 border rounded @error('base_price') border-red-500 @enderror">
                @error('base_price')<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Stok</label>
                <input type="number" name="quantity" value="{{ old('quantity', $product->getCurrentInventory()) }}" min="0"
                    class="w-full px-4 py-2 border rounded">
            </div>
            <div>
                <input type="hidden" name="in_shopify" value="0">
                <label><input type="checkbox" name="in_shopify" value="1" {{ old('in_shopify', $product->in_shopify) ? 'checked' : '' }}> Shopify mağazasında mevcut</label>
            </div>
        </div>
        <div class="mt-6 flex gap-4">
            <button type="submit" class="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700">Güncelle</button>
            <a href="{{ route('products.index') }}" class="text-gray-600 hover:underline">İptal</a>
        </div>
    </form>
</div>
@endsection
