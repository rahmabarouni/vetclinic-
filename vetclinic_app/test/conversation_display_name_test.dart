import 'package:flutter_test/flutter_test.dart';
import 'package:vetclinic_app/models/conversation.dart';

Conversation buildConversation() {
  return Conversation(
    id: 'conv-1',
    clientId: 'client-user-1',
    veterinarianId: 'vet-1',
    status: 'OPEN',
    createdAt: '2026-11-16T14:00:00.000Z',
    updatedAt: '2026-11-16T14:00:00.000Z',
    client: ConversationClient(
      id: 'client-user-1',
      email: 'jean.dupont@email.test',
      firstName: 'Jean',
      lastName: 'Dupont',
      role: 'CLIENT',
    ),
    veterinarian: ConversationVeterinarian(
      id: 'vet-1',
      userId: 'vet-user-1',
      specialty: 'Généraliste',
      user: ConversationUser(
        id: 'vet-user-1',
        email: 'dr.martin@vetclinic.test',
        firstName: 'Sophie',
        lastName: 'Martin',
        role: 'VETERINARIAN',
      ),
    ),
  );
}

void main() {
  test('un client voit le nom du vétérinaire dans le chat', () {
    expect(buildConversation().displayNameFor('client-user-1'), 'Sophie Martin');
  });

  test('un vétérinaire voit le nom du client dans le chat', () {
    expect(buildConversation().displayNameFor('vet-user-1'), 'Jean Dupont');
  });

  test('sans point de vue connu, le nom du vétérinaire est utilisé', () {
    expect(buildConversation().displayNameFor(null), 'Sophie Martin');
  });

  test('repli sur le client quand le vétérinaire est absent', () {
    final conversation = Conversation(
      id: 'conv-2',
      clientId: 'client-user-1',
      status: 'OPEN',
      createdAt: '',
      updatedAt: '',
      client: ConversationClient(
        id: 'client-user-1',
        email: 'jean.dupont@email.test',
        firstName: 'Jean',
        lastName: 'Dupont',
        role: 'CLIENT',
      ),
    );

    expect(conversation.displayNameFor('client-user-1'), 'Jean Dupont');
  });
}
