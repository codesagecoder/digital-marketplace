import { stripe } from "@/lib/stripe";
import { Product, User } from "@/payload-types";
import { AfterChangeHook, BeforeChangeHook } from "payload/dist/collections/config/types";
import { Access, CollectionConfig } from "payload/types";
import { PRODUCT_CATEGORIES } from "../../config";

const addUser: BeforeChangeHook<Product> = async ({ req, data }) => {
  const user = req.user;

  return { ...data, user: user.id };
};

const syncUser: AfterChangeHook<Product> = async ({ req, doc }) => {
  const fullUser = await req.payload.findByID({
    collection: 'users',
    id: req.user.id,
  });

  if (fullUser && typeof fullUser === 'object') {
    const { products } = fullUser;

    const allIDs = [
      ...(products?.map(product => typeof product == 'object' ? product.id : product) ?? [])
    ];

    const createdProductsIDs = allIDs.filter((id, index) => allIDs.indexOf(id) === index);

    const dataToUpdate = [...createdProductsIDs, doc.id];

    await req.payload.update({
      collection: 'users',
      id: fullUser.id,
      data: {
        products: dataToUpdate
      }
    });
  }
};

const isAdminOrHasAccess: Access = ({ req }) => {
  const user = req.user as User | undefined;

  if (!user) return false;
  if (user.role === 'admin') return true;

  const userProductIDs = (user.products ?? []).reduce<Array<string>>((acc, product) => {
    if (typeof product === 'string') acc.push(product);
    else acc.push(product.id);

    return acc;
  }, []);

  return {
    id: { in: userProductIDs }
  };
};

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name'
  },
  access: {
    read: isAdminOrHasAccess,
    update: isAdminOrHasAccess,
    delete: isAdminOrHasAccess,
  },
  hooks: {
    afterChange: [syncUser],
    beforeChange: [
      addUser,
      async (args) => {
        if (args.operation === 'create') {
          const data = args.data as Product;

          const createdProduct = await stripe.products.create({
            name: data.name,
            default_price_data: {
              currency: 'USD',
              unit_amount: Math.round(data.price * 100),
            }
          });

          return {
            ...data,
            stripeId: createdProduct.id,
            priceId: createdProduct.default_price as string,
          } as Product;

        } else if (args.operation === 'update') {
          const data = args.data as Product;

          const updatedProduct = await stripe.products.update(data.stripeId!, {
            name: data.name,
            default_price: data.priceId!
          });

          return {
            ...data,
            stripeId: updatedProduct.id,
            priceId: updatedProduct.default_price as string,
          } as Product;
        }
      }
    ]
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      hasMany: false,
      admin: {
        condition: () => false
      }
    },
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Product details'
    },
    {
      name: 'price',
      label: 'Price in USD',
      min: 0,
      max: 1000,
      type: 'number',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      options: PRODUCT_CATEGORIES.map(({ label, value }) => ({ label, value })),
      required: true,
    },
    {
      name: 'product_files',
      label: 'Product file(s)',
      type: 'relationship',
      relationTo: 'product_files',
      hasMany: false,
      required: true
    },
    {
      name: 'approvedForSale',
      label: 'Product Status',
      type: 'select',
      defaultValue: 'pending',
      access: {
        read: ({ req }) => req.user.role === 'admin',
        create: ({ req }) => req.user.role === 'admin',
        update: ({ req }) => req.user.role === 'admin',
      },
      options: [
        { label: 'Pending verification', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Denied', value: 'denied' },
      ]
    },
    {
      name: 'priceId',
      access: {
        read: () => false,
        create: () => false,
        update: () => false,
      },
      type: 'text',
      admin: {
        hidden: true,
      }
    },
    {
      name: 'stripeId',
      access: {
        read: () => false,
        create: () => false,
        update: () => false,
      },
      type: 'text',
      admin: {
        hidden: true,
      }
    },
    {
      name: 'images',
      label: 'Product images',
      type: 'array',
      minRows: 1,
      maxRows: 4,
      required: true,
      labels: {
        singular: 'Image',
        plural: 'Images'
      },
      fields: [{ name: 'image', type: 'upload', relationTo: 'media' }]
    }
  ]
};
