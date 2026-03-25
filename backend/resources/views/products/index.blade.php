@extends('layouts.app')

@section('title', 'Ürünler')

@section('content')
<div class="bg-white rounded-lg shadow">
    <div class="p-6 flex justify-between items-center">
        <h1 class="text-2xl font-bold">Ürün Listesi</h1>
        <a href="{{ route('products.create') }}" class="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">Yeni Ürün</a>
    </div>
    <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fiyat</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stok</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shopify</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlem</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
                @foreach($products as $product)
                <tr>
                    <td class="px-6 py-4 font-mono text-sm">{{ $product->sku }}</td>
                    <td class="px-6 py-4">{{ $product->name }}</td>
                    <td class="px-6 py-4">{{ number_format($product->base_price, 2) }} $</td>
                    <td class="px-6 py-4">{{ $product->getCurrentInventory() }}</td>
                    <td class="px-6 py-4">
                        @if($product->in_shopify)
                            <span class="text-green-600">✓</span>
                        @else
                            <span class="text-gray-400">-</span>
                        @endif
                    </td>
                    <td class="px-6 py-4 text-right">
                        <a href="{{ route('products.edit', $product) }}" class="text-indigo-600 hover:underline">Düzenle</a>
                    </td>
                </tr>
                @endforeach
            </tbody>
        </table>
    </div>
    @if($products->hasPages())
<div class="p-4 flex gap-2">
    @if($products->previousPageUrl())
        <a href="{{ $products->previousPageUrl() }}" class="text-indigo-600 hover:underline">← Önceki</a>
    @endif
    <span class="text-gray-500">Sayfa {{ $products->currentPage() }} / {{ $products->lastPage() }}</span>
    @if($products->nextPageUrl())
        <a href="{{ $products->nextPageUrl() }}" class="text-indigo-600 hover:underline">Sonraki →</a>
    @endif
</div>
@endif
</div>
@endsection
