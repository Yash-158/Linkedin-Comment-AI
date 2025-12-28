from PIL import Image, ImageDraw

def create_icon(size):
    # Create a new image with a transparent background
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Draw the background rectangle
    draw.rounded_rectangle([(0, 0), (size, size)], radius=size//6, fill='#0A66C2')
    
    # Draw the LinkedIn "in" symbol
    # Calculate positions based on size
    padding = size // 8
    inner_size = size - (2 * padding)
    
    # Draw the "in" symbol
    draw.rectangle([(padding, padding + inner_size//3), 
                   (padding + inner_size, padding + inner_size*2//3)], 
                  fill='white')
    
    # Draw the circles
    circle_size = inner_size // 4
    draw.ellipse([(padding, padding), 
                 (padding + circle_size, padding + circle_size)], 
                fill='white')
    draw.ellipse([(padding + inner_size - circle_size, padding), 
                 (padding + inner_size, padding + circle_size)], 
                fill='white')
    
    return image

# Generate icons in different sizes
sizes = [16, 48, 128]
for size in sizes:
    icon = create_icon(size)
    icon.save(f'icons/icon{size}.png') 