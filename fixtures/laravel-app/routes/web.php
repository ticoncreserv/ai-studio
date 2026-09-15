<?php

use App\Http\Controllers\CustomerController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\QuoteController;
use Illuminate\Support\Facades\Route;

Route::get('/', [HomeController::class, 'index'])->name('home');
Route::get('/quotes', [QuoteController::class, 'index'])->name('quotes.index');
Route::get('/customers', [CustomerController::class, 'index'])->name('customers.index');
Route::get('/up', fn () => response('ok', 200))->name('health');
