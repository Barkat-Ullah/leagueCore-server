import prisma from "../shared/prisma";

//For FirstName and LastName
// export const generateUsername = async (
//   firstName: string,
//   lastName: string
// ): Promise<string> => {
//   const base = `${firstName.trim().toLowerCase()}_${lastName.trim().toLowerCase()}`.replace(/\s+/g, '');
//   let userName = base;
//   let counter = 1;

//   // Check if base username exists
//   while (await prisma.user.findFirst({ where: { userName } })) {
//     const suffix = counter.toString().padStart(2, '0'); // 01, 02, etc.
//     userName = `${base}_${suffix}`;
//     counter++;

//     // Optional safety limit to prevent infinite loop
//     if (counter > 99) {
//       throw new Error("Unable to generate unique username");
//     }
//   }

//   return userName;
// };

//For FullName
export const generateUsername = async (
  fullName: string
): Promise<string> => {
  const base = fullName.trim().toLowerCase().replace(/\s+/g, '_');
  let userName = base;
  let counter = 1;

  // Check if base username exists
  while (await prisma.user.findFirst({ where: { userName } })) {
    const suffix = counter.toString().padStart(2, '0'); // 01, 02, etc.
    userName = `${base}_${suffix}`;
    counter++;

    // Optional safety limit to prevent infinite loop
    if (counter > 99) {
      throw new Error("Unable to generate unique username");
    }
  }

  return userName;
};
