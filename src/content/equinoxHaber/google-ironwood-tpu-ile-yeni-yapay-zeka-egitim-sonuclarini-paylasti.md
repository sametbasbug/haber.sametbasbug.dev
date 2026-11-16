---
title: "Google, Ironwood TPU ile yeni yapay zekâ eğitim sonuçlarını paylaştı"
description: "Google Cloud, 16 Kasım'da açıklanan MLPerf Training v6.1 sonuçlarında Ironwood TPU'ları ve NVIDIA GB300 GPU'ları üzerinde yaptığı yapay zekâ eğitim ölçümlerini yayımladı. Testler, yalnız modelin çalıştırılma hızını değil, belirli bir doğruluk hedefine ulaşmak…"
pubDate: '2026-11-16T22:54:11+03:00'
updatedDate: '2026-11-16T22:54:11+03:00'
heroImage: ""
isDraft: false
tags: []
author: "Selene AI"
category: "Teknoloji"
publicationEra: "technology"
techCategory: "yapay-zeka"
breaking: false
sources:
  - name: "blog.google"
    url: "https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/training-performance-benchmarks-tpus/"
  - name: "mlcommons.org"
    url: "https://mlcommons.org/2026/11/mlperf-training-v6-1-results/"
autoGlossaryLinks: true
---

Google Cloud, 16 Kasım'da açıklanan MLPerf Training v6.1 sonuçlarında Ironwood TPU'ları ve NVIDIA GB300 GPU'ları üzerinde yaptığı yapay zekâ eğitim ölçümlerini yayımladı. Testler, yalnız modelin çalıştırılma hızını değil, belirli bir doğruluk hedefine ulaşmak için gereken eğitim süresini ölçüyor.

## Binlerce hızlandırıcının birlikte çalışması

Google'ın duyurduğu sonuçlara göre 8.192 Ironwood TPU, DeepSeek-V3 tabanlı ön eğitim iş yükünde hedef kaliteye 1 dakika 42 saniyede ulaştı. Şirket, 4.096 hızlandırıcıya kadar ölçeklemede yüzde 96 verimlilik bildirdi. Bu rakamlar söz konusu MLPerf testinin koşullarına ait; farklı model ve veri kümelerine doğrudan genellenemiyor.

Yeni sürümde ajan odaklı pekiştirmeli öğrenme için ayrı bir sınama da bulunuyor. Google, 640 Ironwood TPU ile kodlama görevlerine yönelik eğitimde hedef başarı seviyesine 18,02 dakikada ulaştığını duyurdu. Bu deneyde kod üreten ajanlarla model eğitimi aynı anda yürütülüyor.

Google Cloud, kendi altyapısındaki 256 NVIDIA GB300 GPU ile ön eğitim testinde 31,96 dakikalık sonuç da açıkladı. İşlemci sayıları ve çalıştırılan iş yükleri farklı olduğu için bu iki sürenin doğrudan karşılaştırılması, hangi donanımın genel olarak daha hızlı olduğunu tek başına göstermez.

## MLPerf neden önemli?

Testleri düzenleyen MLCommons'a göre Training v6.1 turunda 24 kuruluşun sunduğu 153 sistemden 250 sonuç elde edildi. Yeni iş yükleri arasında öneri sistemleri ve büyük dil modellerinin görev odaklı sonradan eğitimi yer alıyor.

Bu sonuçlar, yapay zekâ altyapısında yalnız çip sayısının değil, ağ, bellek, yazılım ve eğitim akışının da belirleyici olduğunu gösteren somut karşılaştırma noktaları sunuyor. Gerçek satın alma kararlarında yine de kuruluşların kendi iş yükleriyle ölçüm yapması gerekiyor.

## Kaynaklar

- Ana kaynak: [blog.google](https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/training-performance-benchmarks-tpus/)

## Ek kaynaklar

- [mlcommons.org](https://mlcommons.org/2026/11/mlperf-training-v6-1-results/)
