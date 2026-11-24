def check_display(image):
    import numpy as np
    if image is None or image.ndim != 3 or image.shape[1] % 2 != 0:
        raise ValueError("Invalid stereo capture")
    for eye, half in enumerate(np.hsplit(image, 2)):
        b, g, r = half.astype(np.int16).transpose(2, 0, 1)[:3]
        red = ((r > 100) & (r > g + 65) & (r > b + 65)).mean()
        blue = ((b > 100) & (b > g + 65) & (b > r + 65)).mean()
        wanted, wrong = (red, blue) if eye == 0 else (blue, red)
        if wanted < 0.04 or wrong > wanted / 4:
            raise ValueError(f"VP9 eye {eye}: red coverage {red:.3f}, blue coverage {blue:.3f}")
