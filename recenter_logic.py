import os
import json
from PIL import Image, ImageChops

def trim_and_center(image_path, output_path, target_size=(400, 400)):
    try:
        img = Image.open(image_path).convert("RGBA")
        
        # Trouver la boîte englobante des pixels non transparents
        # On utilise le canal alpha pour détecter le contenu réel
        alpha = img.getchannel('A')
        bbox = alpha.getbbox()
        
        if not bbox:
            return False # Image vide
            
        # Recadrer au plus près du contenu
        cropped = img.crop(bbox)
        
        # Créer une nouvelle image carrée transparente
        # On prend la dimension la plus grande pour faire un carré
        w, h = cropped.size
        max_dim = max(w, h)
        
        # On crée un canvas avec un peu de marge (10%)
        canvas_size = int(max_dim * 1.1)
        new_img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        
        # Coller au centre exact
        offset = ((canvas_size - w) // 2, (canvas_size - h) // 2)
        new_img.paste(cropped, offset)
        
        # Redimensionner pour l'uniformité (optionnel)
        # new_img = new_img.resize(target_size, Image.LANCZOS)
        
        new_img.save(output_path, "PNG")
        return True
    except Exception as e:
        print(f"Erreur sur {image_path}: {e}")
        return False

# Dossiers
input_dir = 'cards_images'
output_dir = 'cards_images_centered'
os.makedirs(output_dir, exist_ok=True)

# Charger les données
with open('cards.json', 'r') as f:
    cards = json.load(f)

print("Recentrage des images en cours...")

processed_count = 0
for card in cards:
    old_name = card['basic_asset']
    # On force l'extension .png pour le nouveau fichier
    new_name = os.path.splitext(old_name)[0] + ".png"
    
    input_path = os.path.join(input_dir, old_name)
    output_path = os.path.join(output_dir, new_name)
    
    if os.path.exists(input_path):
        # PIL ne gère pas le SVG nativement, on traite les PNG
        if input_path.lower().endswith('.png'):
            if trim_and_center(input_path, output_path):
                card['basic_asset'] = new_name
                processed_count += 1
        else:
            # Pour les SVG, on les copie en attendant (ou on les renomme)
            # Si vous avez un outil de conversion SVG -> PNG, c'est le moment.
            # Ici on va juste mettre à jour le nom dans le JSON pour pointer vers .png
            card['basic_asset'] = new_name

print(f"Terminé ! {processed_count} images PNG ont été recentrées.")

# Sauvegarder les changements
with open('cards.json', 'w') as f:
    json.dump(cards, f, indent=2)

with open('cards.js', 'w') as f:
    f.write('window.CARD_DATA = ' + json.dumps(cards, indent=2) + ';')
