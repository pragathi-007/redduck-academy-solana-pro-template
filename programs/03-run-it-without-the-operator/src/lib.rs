pub fn claim(ctx: Context<Claim>) -> Result<()> {
    instructions::claim(ctx)
}

pub fn set_price(ctx: Context<SetPrice>) -> Result<()> {
    instructions::set_price(ctx)
}