@extends('layouts.app')

@section('title', $product->name)

@section('content')
<div class="bg-white rounded-lg shadow p-6">
    <h1 class="text-2xl font-bold mb-6">{{ $product->name }} ({{ $product->sku }})</h1>
    <dl class="grid grid-cols-2 gap-4">
        <dt class="text-gray-500">Taban Fiyat</dt>
        <dd>{{ number_format($product->base_price, 2) }} $</dd>
        <dt class="text-gray-500">Stok</dt>
        <dd>{{ $product->getCurrentInventory() }}</dd>
        <dt class="text-gray-500">Shopify'da</dt>
        <dd>{{ $product->in_shopify ? 'Evet' : 'Hayır' }}</dd>
    </dl>
    @if($product->priceTiers->isNotEmpty())
    <h2 class="mt-6 font-semibold">B2B Fiyat Katmanları</h2>
    <table class="mt-2 min-w-full">
        <thead><tr><th class="text-left">Tag</th><th class="text-left">Fiyat</th><th class="text-left">Min. Adet</th></tr></thead>
        <tbody>
            @foreach($product->priceTiers as $tier)
            <tr><td>{{ $tier->customer_tag }}</td><td>{{ number_format($tier->price, 2) }} $</td><td>{{ $tier->min_quantity }}</td></tr>
            @endforeach
        </tbody>
    </table>
    @endif
    <div class="mt-6">
        <a href="{{ route('products.edit', $product) }}" class="text-indigo-600 hover:underline">Düzenle</a>
    </div>
</div>
@endsection
