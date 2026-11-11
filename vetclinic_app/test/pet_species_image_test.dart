import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/widgets/pet_species_image.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('chaque espece connue a une image dediee', () {
    expect(PetSpeciesImage.assetFor('DOG'), 'assets/animals/dog.png');
    expect(PetSpeciesImage.assetFor('CAT'), 'assets/animals/cat.png');
    expect(PetSpeciesImage.assetFor('BIRD'), 'assets/animals/bird.png');
    expect(PetSpeciesImage.assetFor('RABBIT'), 'assets/animals/rabbit.png');
    expect(PetSpeciesImage.assetFor('RODENT'), 'assets/animals/rodent.png');
    expect(PetSpeciesImage.assetFor('REPTILE'), 'assets/animals/reptile.png');
  });

  test('espece inconnue -> fallback (pas d image)', () {
    expect(PetSpeciesImage.assetFor('UNKNOWN'), isNull);
    expect(PetSpeciesImage.assetFor(''), isNull);
  });

  test('les images d especes sont declarees et chargeables', () async {
    for (final species in ['DOG', 'CAT', 'BIRD', 'RABBIT', 'RODENT', 'REPTILE']) {
      final asset = PetSpeciesImage.assetFor(species)!;
      final data = await rootBundle.load(asset);
      expect(data.lengthInBytes, greaterThan(0), reason: '$asset est vide');
    }
  });

  test('l image de couverture du login est chargeable', () async {
    final data = await rootBundle.load('assets/images/login_cover.png');
    expect(data.lengthInBytes, greaterThan(0));
  });
}
