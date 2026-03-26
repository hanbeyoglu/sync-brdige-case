@extends('layouts.app')

@section('title', 'Yeni Ürün')

@section('content')
<div class="bg-white rounded-lg shadow p-6 max-w-2xl">
    <h1 class="text-2xl font-bold mb-6">Yeni Ürün Ekle</h1>
    <form method="POST" action="{{ route('products.store') }}">
        @csrf
        <div class="space-y-4">
            <div>
                <label class="block text-gray-700 mb-1">SKU *</label>
                <input type="text" name="sku" value="{{ old('sku') }}" required
                    class="w-full px-4 py-2 border rounded @error('sku') border-red-500 @enderror">
                @error('sku')<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Ürün Adı *</label>
                <input type="text" name="name" value="{{ old('name') }}" required
                    class="w-full px-4 py-2 border rounded @error('name') border-red-500 @enderror">
                @error('name')<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Açıklama</label>
                <textarea name="description" rows="3" class="w-full px-4 py-2 border rounded">{{ old('description') }}</textarea>
            </div>
            <div>
                <label class="block text-gray-700 mb-1">Taban Fiyat ($) *</label>
                <input type="number" step="0.01" name="base_price" value="{{ old('base_price', 0) }}" required
                    class="w-full px-4 py-2 border rounded @error('base_price') border-red-500 @enderror">
                @error('base_price')<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
            </div>

            <div class="pt-2">
                @php($tierTags = ['wholesale', 'retail', 'vip'])
                <h2 class="text-lg font-semibold mb-3">B2B Fiyat Katmanları</h2>
                <div class="space-y-3">
                    @foreach($tierTags as $tag)
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div>
                                <label class="block text-gray-700 mb-1">{{ ucfirst($tag) }} </label>
                            </div>
                            <div>
                                <label class="block text-gray-700 mb-1">Fiyat ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    name="price_tiers[{{ $tag }}][price]"
                                    value="{{ old("price_tiers.$tag.price") }}"
                                    class="w-full px-4 py-2 border rounded @error("price_tiers.$tag.price") border-red-500 @enderror"
                                >
                                @error("price_tiers.$tag.price")<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
                            </div>
                            <div>
                                <label class="block text-gray-700 mb-1">Min. Adet</label>
                                <input
                                    type="number"
                                    name="price_tiers[{{ $tag }}][min_quantity]"
                                    value="{{ old("price_tiers.$tag.min_quantity") }}"
                                    class="w-full px-4 py-2 border rounded @error("price_tiers.$tag.min_quantity") border-red-500 @enderror"
                                >
                                @error("price_tiers.$tag.min_quantity")<p class="text-red-500 text-sm">{{ $message }}</p>@enderror
                            </div>
                        </div>
                    @endforeach
                </div>
            </div>

            <div>
                <label class="block text-gray-700 mb-1">Başlangıç Stok</label>
                <input type="number" name="quantity" value="{{ old('quantity', 0) }}" min="0"
                    class="w-full px-4 py-2 border rounded">
            </div>
            <div>
                <input type="hidden" name="in_shopify" value="0">
                <label><input type="checkbox" name="in_shopify" value="1" {{ old('in_shopify') ? 'checked' : '' }}> Shopify mağazasında mevcut</label>
            </div>
        </div>
        <div class="mt-6 flex gap-4">
            <button type="submit" class="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700">Kaydet</button>
            <a href="{{ route('products.index') }}" class="text-gray-600 hover:underline">İptal</a>
        </div>
    </form>
</div>
@endsection
