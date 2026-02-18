"""
Anima 2B Style Explorer - Анализатор уникальности стилей
Вычисляет "Style DNA" с использованием ансамбля моделей VGG19 (Gram Matrices), CLIP (Vibe) и Laplacian Edge Variance.
"""

import os
import json
import glob
import time
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from PIL import Image
from tqdm import tqdm
from torch.utils.data import Dataset, DataLoader
from transformers import CLIPProcessor, CLIPModel, AutoModel, AutoImageProcessor
from torchvision import models, transforms
from sklearn.neighbors import LocalOutlierFactor
from scipy.ndimage import laplace

# --- CONFIGURATION ---
IMAGE_DIR = "images"
OUTPUT_FILE = "style_analysis.json"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH_SIZE = 128 
NUM_WORKERS = 4 

class StyleDataset(Dataset):
    """Загрузчик датасета со встроенным анализом краев и предобработкой."""
    def __init__(self, image_paths, processor):
        self.image_paths = image_paths
        self.processor = processor

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        path = self.image_paths[idx]
        artist_id = os.path.splitext(os.path.basename(path))[0]
        try:
            with Image.open(path) as img:
                image = img.convert("RGB")
                image_resized = image.resize((224, 224))
                pixels = self.processor(images=image_resized, return_tensors="pt")["pixel_values"].squeeze(0)
                
                # Лапласианный анализ краев
                img_gray = np.array(image_resized.convert("L"), dtype=np.float32)
                edge_map = laplace(img_gray)
                edge_stats = np.array([np.var(edge_map), np.mean(np.abs(edge_map)), np.std(img_gray)], dtype=np.float32)
                
                return pixels, torch.tensor(edge_stats), artist_id
        except Exception:
            return None

def custom_collate(batch):
    """Корректно обрабатывает неудачные загрузки изображений."""
    batch = [item for item in batch if item is not None]
    if not batch: return None
    return torch.utils.data.dataloader.default_collate(batch)

def calculate_gram_matrix(features):
    """Извлекает корреляцию текстуры стиля."""
    b, c, h, w = features.size()
    features = features.view(b, c, h * w)
    gram = torch.bmm(features, features.transpose(1, 2))
    return gram.div(c * h * w + 1e-6)

def load_ensemble():
    """Инициализирует ансамбль моделей анализа стиля."""
    print(f"[*] Initializing AI Ensemble on {DEVICE.upper()}...")
    clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(DEVICE)
    res_proc = AutoImageProcessor.from_pretrained("microsoft/resnet-50")
    res_model = AutoModel.from_pretrained("microsoft/resnet-50").to(DEVICE)
    return clip_model, res_proc, res_model

def run_analysis():
    image_paths = glob.glob(os.path.join(IMAGE_DIR, "**/*.webp"), recursive=True)
    if not image_paths:
        print(f"❌ Error: No .webp images found in {IMAGE_DIR}")
        return

    clip_model, res_proc, res_model = load_ensemble()
    dataloader = DataLoader(
        dataset=StyleDataset(image_paths, res_proc), 
        batch_size=BATCH_SIZE, 
        num_workers=NUM_WORKERS, 
        pin_memory=True, 
        collate_fn=custom_collate
    )

    embeddings, ids = [], []
    clip_model.eval(); res_model.eval()

    print(f"[*] Extracting Stylistic Fingerprints from {len(image_paths)} artists...")
    start_time = time.time()
    pbar = tqdm(total=len(image_paths), desc="Analyzing", unit="img")

    with torch.no_grad():
        for batch in dataloader:
            if batch is None: continue
            pixels, style_stats, b_ids = batch
            
            pixels = pixels.to(DEVICE)
            
            # 1. Texture Features
            res_out = res_model(pixels, output_hidden_states=True)
            textures = []
            for stage in [1, 2, 3]:
                gram = calculate_gram_matrix(res_out.hidden_states[stage])
                textures.append(torch.mean(gram, dim=2).cpu().numpy())
            texture_vec = np.concatenate(textures, axis=1)
            
            # 2. Vibe Features
            cv_out = clip_model.vision_model(pixel_values=pixels).pooler_output
            clip_out = clip_model.visual_projection(cv_out).cpu().numpy()
            
            # 3. Stylometry Stats
            s_stats = style_stats.numpy()
            
            for i in range(len(b_ids)):
                tn = texture_vec[i] / (np.linalg.norm(texture_vec[i]) + 1e-8)
                cn = clip_out[i] / (np.linalg.norm(clip_out[i]) + 1e-8)
                sn = s_stats[i] / (np.linalg.norm(s_stats[i]) + 1e-8)
                master = np.concatenate([tn * 1.5, sn * 2.0, cn * 1.0])
                embeddings.append(master)
                ids.append(b_ids[i])
                
            pbar.update(len(b_ids))

    pbar.close()
    
    if not embeddings:
        print("❌ Error: No features extracted.")
        return

    print(f"[*] Calculating Stylistic Uniqueness via LOF...")
    embeddings = np.array(embeddings)
    lof = LocalOutlierFactor(n_neighbors=25, metric='cosine')
    lof.fit(embeddings)
    lof_scores = -lof.negative_outlier_factor_ 
    
    ranks = np.argsort(np.argsort(lof_scores))
    percentiles = ranks / (len(ranks) - 1)
    final_scores = np.power(percentiles, 0.7)

    results = {a_id: {"uniqueness": float(round(final_scores[idx], 4))} 
               for idx, a_id in enumerate(ids)}

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✨ SUCCESS: Analysis complete in {time.time() - start_time:.2f}s ✨")

if __name__ == "__main__":
    run_analysis()
