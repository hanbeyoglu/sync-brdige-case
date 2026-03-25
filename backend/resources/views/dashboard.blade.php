@extends('layouts.app')

@section('title', 'Dashboard')

@section('content')
<div class="bg-white rounded-lg shadow p-6">
    <h1 class="text-2xl font-bold text-gray-900 mb-4">SyncBridge B2B Inventory Orchestrator</h1>
    <p class="text-gray-600 mb-6">Laravel panel üzerinden ürün ve stok yönetimi yapabilirsiniz.</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-indigo-50 p-4 rounded">
            <p class="text-indigo-600 font-semibold">Ürünler</p>
            <p class="text-2xl font-bold">{{ \App\Models\Product::count() }}</p>
        </div>
        <div class="bg-green-50 p-4 rounded">
            <p class="text-green-600 font-semibold">Shopify'da</p>
            <p class="text-2xl font-bold">{{ \App\Models\Product::where('in_shopify', true)->count() }}</p>
        </div>
        <div class="bg-amber-50 p-4 rounded">
            <p class="text-amber-600 font-semibold">Sadece Harici</p>
            <p class="text-2xl font-bold">{{ \App\Models\Product::where('in_shopify', false)->count() }}</p>
        </div>
    </div>
    <div class="mt-6">
        <a href="{{ route('products.index') }}" class="text-indigo-600 hover:underline">Ürünleri Yönet →</a>
    </div>
</div>
@endsection
