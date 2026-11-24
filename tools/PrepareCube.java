import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Apply the upstream cube sample's flipSourceX once, before slicing the strip. */
class PrepareCube {
    public static void main(String[] args) throws Exception {
        BufferedImage strip = ImageIO.read(new File(args[0]));
        if (strip == null || (strip.getWidth() != 6 * strip.getHeight() && strip.getWidth() != 12 * strip.getHeight())) {
            throw new IllegalArgumentException("Expected six square faces per eye");
        }
        int width = strip.getWidth();
        var raster = strip.getRaster();
        int bands = raster.getNumBands();
        int[] row = new int[width * bands], mirrored = new int[row.length];
        for (int y = 0; y < strip.getHeight(); ++y) {
            raster.getPixels(0, y, width, 1, row);
            for (int x = 0; x < width; ++x) {
                System.arraycopy(row, x * bands, mirrored, (width - 1 - x) * bands, bands);
            }
            raster.setPixels(0, y, width, 1, mirrored);
        }
        if (!ImageIO.write(strip, "png", new File(args[1]))) {
            throw new IllegalStateException("PNG writer unavailable");
        }
    }
}
